# 用户留存

路径：埋点分析 → **用户留存** `/tracking/retention`

## 能力简介

用户留存回答「首次来访的用户在接下来的第 1 / 2 / … / N 天里还会回来的比例是多少」。数据源统一走 `page_view_raw`（与 `/monitor/visits` 同源），在装配层用一次 CTE 构建 cohort × day_offset 矩阵，前端渲染热力图 + 平均留存曲线。

| 用途 | 场景 |
|---|---|
| 新用户留存健康度 | 每日新增 cohort 的 day 1 / day 7 / day 30 留存 |
| 版本 / 渠道对比 | 切换 `since`/`until` 窗口，对比不同时间段 cohort 的留存曲线 |
| 可分享定位 | URL 驱动，把链接粘到 IM/飞书即可还原当前视图 |
| 容灾降级 | API 异常时渲染 `source=error` 徽标 + 空矩阵，不 5xx 整页 |

核心约束（ADR-0028）：

- **Cohort 粒度**：UTC 日，同一用户当天多次访问只计一次
- **身份维度**：`identity=session`（默认）或 `identity=user`（`COALESCE(user_id, session_id)`）
- **比例保留 4 位小数**；`totalNewUsers=0` 时所有数组长度仍等于 `returnDays + 1`
- **加权平均**：跨 cohort 的 `averageByDay[k] = Σ retained(*, k) / Σ cohortSize(*)`，而非简单平均

## URL 驱动

所有参数都从 URL `searchParams` 读取，复制链接即可分享；Web 侧会对非法输入做静默夹紧回退到默认值，避免整页失败。

| 参数 | 默认值 | 范围 | 说明 |
|---|---|---|---|
| `cohortDays` | `7` | 1 ~ 30 | 最近 N 天新用户纳入 cohort |
| `returnDays` | `7` | 1 ~ 30 | 观察期（day 0 ~ day N） |
| `identity` | `session` | `session` \| `user` | 用户身份键；`user` 需有 `user_id` 列 |
| `since` | 由 `until` 反推 | ISO 8601 | 窗口起点（可选） |
| `until` | `now` | ISO 8601 | 窗口终点（可选） |

示例：`/tracking/retention?cohortDays=7&returnDays=14&identity=session&since=2026-04-16T00:00:00Z&until=2026-04-30T23:59:59Z`

窗口必须满足 `untilMs - sinceMs ≥ (cohortDays + returnDays) * 1d`，否则 Server 返回 `source=error` 兜底。

## 页面布局

自上而下：

1. **留存配置表单** —— cohortDays / returnDays / identity / since / until，点击「查询」以 `router.replace` 写回 URL
2. **4 张汇总卡** —— 新用户总数 · 平均 day 1 留存 · 平均 day N 留存 · Cohort 数量
3. **留存矩阵热力图** —— 行 cohort · 列 day_offset · 绿色色阶 0~100%，hover 显示精确留存率
4. **平均留存曲线** —— `@ant-design/plots` Line 组件展示 averageByDay（百分比）

## 字段口径

| 字段 | 来源（SQL） | 用途 |
|---|---|---|
| cohortDate | `DATE_TRUNC('day', TO_TIMESTAMP(ts_ms/1000) AT TIME ZONE 'UTC')` | 新用户首次出现的 UTC 日 |
| cohortSize | `COUNT(DISTINCT uid) WHERE first_seen IN (sinceMs..sinceMs+cohortDays)` | 该 cohort 的新用户总数 |
| retentionByDay[k] | `COUNT(DISTINCT uid WHERE day_offset=k) / cohortSize` | 该 cohort 在 day k 的回访率 |
| averageByDay[k] | `Σ retained(*, k) / Σ cohortSize(*)` | 跨 cohort 加权平均（小 cohort 不膨胀） |
| totalNewUsers | `Σ cohortSize` | 所有 cohort 的新用户之和 |

**重要语义**：

- `day 0` 恒为 1（cohort 定义：首次出现当天）
- 缺失的 `day_offset` 自动补 0（避免前端做稀疏矩阵填充）
- 同一用户在同一 cohort 的多个 day_offset 去重后统计
- 时间窗口不足 → 聚合抛错 → 装配层降级为 `source=error`（空矩阵，不 5xx）

## 如何验证

**方案 A · 真实浏览器驱动**

1. `pnpm dev:demo` 启动 demo，在左侧「埋点分析」分组打开 `/tracking/retention`
2. 反复硬刷新 + 清 `ghc_*` localStorage 产生多个 session
3. Web 后台 `/tracking/retention` 应看到今日 cohort，day 0 = 100%

**方案 B · psql 多天造数（推荐）**

demo 页硬刷新只覆盖 day 0；想看 cohort 衰减曲线可用 `examples/nextjs-demo/README.md` 里的 psql 脚本：

- 清理：`DELETE FROM page_view_raw WHERE project_id='demo' AND session_id LIKE 'seed-retention-%'`
- 插入：最近 3 天 × 3 cohort × 3 session，典型留存 100% → 66% → 33%
- 刷新大盘：日常周期 `cohortDays=7&returnDays=7` 即可看到完整 3 行矩阵

## 常见问题

**Q：identity=user 会不会报错？**
A：当前 `page_view_raw` schema 暂无 `user_id` 列（ADR-0020 Tier 2.A 初版未纳入）。切到 `user` 会让 SQL 报列不存在 → Controller 返回 `source=error`；默认 `identity=session` 可稳定工作。若业务已在 SDK 层调用 `setUser({ id })`，后续补列迁移后即可切换。

**Q：为什么 day 0 ≠ cohortSize？**
A：day 0 是百分比（retained/cohortSize）恒为 1；cohortSize 是绝对数。两者同源但量纲不同。

**Q：averageByDay 为什么不是各 cohort 同 day 的简单平均？**
A：简单平均会让小 cohort 权重膨胀（例如 cohort A size=10 / day1=0.5，cohort B size=1000 / day1=0.1，简单平均 0.3 会严重高估）。加权平均 `(5 + 100) / (10 + 1000) ≈ 0.104` 才是真实的总体留存率。

**Q：窗口不足时会怎样？**
A：`untilMs - sinceMs < (cohortDays + returnDays) * 1d` → 聚合层抛错 → 装配层 `source=error` + 空矩阵 + 400 级告警。不会 5xx 导致整页崩溃。

## 关联

- 触发场景：[examples/nextjs-demo/app/(demo)/tracking/retention](https://github.com/lotosv2010/g-heal-claw/tree/main/examples/nextjs-demo/app/(demo)/tracking/retention)
- 同源视角：[访问统计](/guide/visits) / [转化漏斗](/guide/tracking/funnel)
- 契约与实现：[ADR-0028 用户留存切片](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0028-tracking-retention-slice.md)
