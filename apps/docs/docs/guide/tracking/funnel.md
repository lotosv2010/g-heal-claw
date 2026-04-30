# 转化漏斗

路径：埋点分析 → **转化漏斗** `/tracking/funnel`

## 能力简介

转化漏斗回答「用户按顺序走完 N 步的比例是多少，在哪一步流失最严重」。与事件分析 / 曝光分析共用同一数据源 `track_events_raw`，在装配层按动态 N 步 CTE 做用户级严格顺序命中。

| 用途 | 场景 |
|---|---|
| 注册 / 付费 / 激活路径分析 | view_home → click_cta → submit_form → pay_success 的逐步流失 |
| 运营活动效果 | 首页 Banner 曝光 → 商品落地页 → 加购 → 下单 |
| 实验对比 | 在两个 URL 中切换 `steps` 对同一窗口做不同漏斗对照 |
| 可分享定位 | URL 驱动，任何人打开链接即可还原完全相同的漏斗视图 |

核心约束（ADR-0027）：

- **严格顺序**：下一步必须在上一步**之后**出现
- **用户级去重**：`COALESCE(user_id, session_id)` 作为用户键
- **步长上限**：相邻两步之间必须在 `stepWindowMinutes` 内完成
- **比例保留 4 位小数**；分母为 0 时固定为 0（不会 NaN / 除零）

## URL 驱动

所有参数都从 URL `searchParams` 读取，复制链接即可分享；Web 侧会对非法输入做静默夹紧回退到默认值，避免整页失败。

| 参数 | 默认值 | 范围 | 说明 |
|---|---|---|---|
| `steps` | `view_home,click_cta,submit_form` | 2 ~ 8 项，每项 1 ~ 128 字符 | 事件名 CSV，按顺序解析 |
| `windowHours` | `24` | 1 ~ 168（7d） | 聚合窗口（小时） |
| `stepWindowMinutes` | `60` | 1 ~ 1440（24h） | 相邻步骤间最长等待间隔（分钟） |

示例：`/tracking/funnel?steps=view_home,click_cta,submit_form,pay_success&windowHours=48&stepWindowMinutes=30`

## 页面布局

自上而下：

1. **漏斗配置表单** —— 步骤 CSV / 窗口 / 步长，点击「查询」以 `router.replace` 写回 URL
2. **4 张汇总卡** —— 总进入用户 · 总转化率 · 聚合窗口 · 步长上限
3. **漏斗形态图** —— `@ant-design/plots` Funnel 组件可视化用户逐步流失
4. **步骤明细表** —— 序号 · 事件名 · 用户数 · 本步/上一步 · 本步/首步

## 字段口径

| 字段 | 来源（SQL） | 用途 |
|---|---|---|
| totalEntered | 首步用户数（去重） | 漏斗分母，所有「本步/首步」都以它为基础 |
| users（单步） | `COUNT(DISTINCT COALESCE(user_id, session_id))` | 在严格顺序 + 步长上限约束下命中该步的用户数 |
| conversionFromPrev | 本步 users / 上一步 users | 第 1 步恒为 1（totalEntered>0）或 0（空窗口） |
| conversionFromFirst | 本步 users / totalEntered | 累计转化率；等于各 `conversionFromPrev` 的乘积 |
| overallConversion | 末步 users / totalEntered | 整个漏斗的端到端转化率 |

**重要语义**：

- 首步 0（空窗口）→ **全部比例返回 0**，overallConversion=0（不抛错）
- 末步 0 **不短路** → 前面步骤比例正常计算，仅最后一步比例为 0
- 步数范围外（< 2 或 > 8）→ Zod 直接拒绝请求，Web 侧回退默认 3 步

## 如何验证

本地联调可直接使用 [examples/nextjs-demo](https://github.com/lotosv2010/g-heal-claw/tree/main/examples/nextjs-demo) 里的「转化漏斗触发器」场景：

1. `pnpm dev:demo` 启动 demo，在左侧「埋点分析」分组打开 `/tracking/funnel`
2. 按 1 → 2 → 3 顺序点击三个按钮（分别上报 `view_home` / `click_cta` / `submit_form`）
3. 打开 Web 后台 `/tracking/funnel`，漏斗 3 步用户数应均为 1（同一用户命中）
4. 刷新 demo 页面（换一个 session_id）再重复 1 次，漏斗用户数应变为 2

## 常见问题

**Q：第 1 步用户数 > 第 2 步，但 conversionFromPrev 显示 1.0？**
A：Step 1 的 conversionFromPrev 设计为"本步/上一步自身"= 1.0；只有 step 2+ 才是相对于上一步。要看到首步流失，需在前面再加一步（如 `view_any_page`）。

**Q：同一用户反复点同一步，users 会累加吗？**
A：不会。`users = COUNT(DISTINCT COALESCE(user_id, session_id))` 天然去重。累加的是事件次数（`COUNT(*)`），漏斗 API 不返回该字段。

**Q：为什么步长过大会丢数据？**
A：`stepWindowMinutes` 决定相邻两步最长间隔，若窗口太紧（如 1min），用户在真实使用中很难一次走完，会被判定为"未按时抵达下一步"，导致后续步骤丢失。建议起步 60min。

## 关联

- 触发场景：[examples/nextjs-demo/app/(demo)/tracking/funnel](https://github.com/lotosv2010/g-heal-claw/tree/main/examples/nextjs-demo/app/(demo)/tracking/funnel)
- 事件打点：[埋点分析](/guide/tracking) / [自定义上报](/guide/custom)
- 契约与实现：[ADR-0027 转化漏斗切片](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0027-tracking-funnel-slice.md)
