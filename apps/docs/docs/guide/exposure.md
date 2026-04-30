# 曝光分析

路径：埋点分析 → **曝光分析** `/tracking/exposure`

## 能力简介

曝光分析面向"用户实际看见了什么"这一视角，与「事件分析」共用数据源 `track_events_raw`，仅切片 `track_type='expose'` 子集。

| 用途 | 场景 |
|---|---|
| 衡量运营位触达 | 首页 Banner / 商品坑位有多少用户真正看到？不是有多少人点击 |
| A/B 实验基准线 | 实验组 vs 对照组的曝光覆盖面是否对齐？实验桶污染早发现 |
| 信息架构评估 | 折叠/底部内容的曝光量是否被首屏遮蔽？辅助信息层级决策 |
| 广告 / 推广投放 | 第三方监测对齐内部曝光口径 |

曝光事件由 SDK 的 [`trackPlugin`](/sdk/tracking) 自动采集：浏览器原生 `IntersectionObserver` 命中目标元素且停留 ≥ `exposeDwellMs`（默认 500ms）后，按节流窗口 `throttleMs`（默认 1000ms）批量上报。

## 页面布局

自上而下：

1. **4 张汇总卡** —— 总曝光 · 去重元素 · 去重页面 · 每用户曝光（带环比 delta）
2. **小时趋势图** —— 支持「曝光量 / 去重用户」Segmented 切换
3. **Top 元素表** —— 按 `selector`（回落 `event_name`）聚合，曝光量倒序；展示代表文案样本、去重用户、覆盖页面数、占比
4. **Top 页面表** —— 按 `page_path` 聚合；定位曝光密度最高的页面

## 汇总卡字段含义

| 字段 | 来源（SQL） | 用途 |
|---|---|---|
| 总曝光量 | `COUNT(*) WHERE track_type='expose'` | 窗口内曝光条数；环比 = (本窗口 − 上等长窗口) / 上等长窗口 |
| 去重元素 | `COUNT(DISTINCT COALESCE(target_selector, event_name))` | 不同曝光元素的数量，反映曝光覆盖面 |
| 去重页面 | `COUNT(DISTINCT page_path)` | 触达曝光的页面数 |
| 每用户曝光 | `总曝光量 / 去重用户` | 单个用户平均看到的元素数；用户越活跃值越高 |

**去重用户口径**：`COUNT(DISTINCT COALESCE(user_id, session_id))` —— user_id 缺失时回退 session_id，兼顾匿名访客。

## Top 元素字段含义

| 列 | 来源 | 用途 |
|---|---|---|
| 元素 / 文案样本 | `target_selector` 优先，回落 `event_name`；文案取 `MAX(target_text)` | 代表性标识；文案样本用引号包裹 |
| 曝光量 | `COUNT(*)` | 该元素在窗口内的曝光次数 |
| 用户 | 去重 user_id ∪ session_id | 该元素被多少人看到 |
| 页面 | 去重 page_path | 该元素出现在多少个页面 |
| 占比 | count / 总曝光 × 100 | 在窗口总曝光中的份额（保留 2 位小数） |

## 数据埋点标记

SDK 侧只需标记 `data-track-expose`，可选加 `data-track-id` 指定稳定标识：

```html
<!-- 推荐：使用 data-track-id 固定 selector，方便跨版本追踪 -->
<section data-track-expose data-track-id="promo_hero">
  <h2>限时 5 折</h2>
</section>

<!-- 业务字段自动进入 properties -->
<div
  data-track-expose
  data-track-id="product_card"
  data-track-sku="SKU-A"
  data-track-price="99.9"
>
  ...
</div>
```

命中条件：

- 元素进入视口 50% 以上（IntersectionObserver 默认阈值）
- 停留时间 ≥ `exposeDwellMs`（默认 500ms，可通过 `trackPlugin({ exposeDwellMs })` 调整）
- 同一元素实例**只上报一次**（避免滚动回看重复计数）

## 后端 API

`GET /dashboard/v1/tracking/exposure/overview`

| Query | 类型 | 默认 | 说明 |
|---|---|---|---|
| `projectId` | string | 必填 | 项目 ID |
| `windowHours` | number | 24 | 聚合窗口（1~168 小时） |
| `limitSelectors` | number | 10 | Top 元素返回条数（1~50） |
| `limitPages` | number | 10 | Top 页面返回条数（1~50） |

示例响应：

```json
{
  "data": {
    "summary": {
      "totalExposures": 12453,
      "uniqueSelectors": 86,
      "uniquePages": 12,
      "uniqueUsers": 1843,
      "exposuresPerUser": 6.76,
      "deltaPercent": 12.3,
      "deltaDirection": "up"
    },
    "trend": [
      { "hour": "2026-04-30T09:00:00.000Z", "count": 512, "uniqueUsers": 203 }
    ],
    "topSelectors": [
      {
        "selector": "[data-track-expose=\"promo_hero\"]",
        "sampleText": "限时 5 折",
        "count": 2031,
        "uniqueUsers": 1204,
        "uniquePages": 2,
        "sharePercent": 16.31
      }
    ],
    "topPages": [
      { "pagePath": "/home", "count": 4520, "uniqueUsers": 1502 }
    ]
  }
}
```

## 本地联调

1. 启动基础设施与应用：`docker compose up -d && pnpm dev`
2. 访问 demo 首页 `http://localhost:3002`，点击「埋点分析」分组下的 `/tracking/expose` 场景
3. DevTools → Network 观察 `/ingest/v1/events` 载荷中 `trackType='expose'` 的批次
4. 访问 `http://localhost:3000/tracking/exposure` 查看聚合大盘

## 常见问题

### Q: Top 元素里出现了很多 `button` / `div` 这种通用标签名？

说明业务侧没有给曝光元素打 `data-track-id`，SDK 回落到 `event_name`（规范化的 selector/tag）。建议给关键运营位加 `data-track-id` 固定标识，避免跨版本漂移。

### Q: 曝光量与点击量的比值（CTR）在哪里看？

曝光分析大盘不直接显示 CTR；请在「事件分析」大盘按 `track_type` 桶分别取 `click` 与 `expose` 的事件数自行计算。后续 `tracking/funnel` 落地后会提供标准 CTR 报表。

### Q: 为什么同一页面反复滚动，曝光量不增加？

这是故意设计 —— 同一元素实例**仅上报一次**。如需跟踪滚动回看，请改用 `GHealClaw.track('<custom>_view', {...})` 主动埋点。

### Q: 曝光数据量巨大，会不会拖慢查询？

当前索引覆盖 `(project_id, track_type, ts_ms)`，windowHours ≤ 24h 的查询毫秒级返回。若出现 7d 窗口的慢查询，后续可考虑加 `(project_id, track_type, target_selector, ts_ms)` 复合索引。
