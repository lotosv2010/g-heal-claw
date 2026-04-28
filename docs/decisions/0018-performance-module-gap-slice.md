# ADR-0018: 性能监控模块完整性切片（T2.1.8）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-28 |
| 决策人 | @gaowenbin |

## 背景

T2.1.1（SDK PerformancePlugin）+ T2.1.6（Dashboard 性能大盘 API）+ Web `/performance` 三段闭环已于 2026-04-27 交付，覆盖 LCP/FCP/CLS/INP/TTFB 的采集 → 入库 → p75 聚合 → 三态展示。2026-04-28 对该模块做端到端 review（SDK plugins / shared Schema / server aggregator / dashboard DTO / web 面板五层交叉核对）后，发现下列已写入代码但**文档未同步**、以及**指标矩阵不完整**的差距：

### 已实现但文档滞后
- SDK 已交付 `longTaskPlugin`（50ms 阈值采集）和 `speedIndexPlugin`（FP/FCP/LCP 梯形法 AUC 近似，±20% 精度）；`demo/ghc-provider.tsx` 已注册
- `PerformanceEventSchema.metric` 枚举已从 5 值扩展到 10 值（新增 FSP / FID / TTI / TBT / SI）
- `PerformanceOverviewDto` 已在 Dashboard 侧扩展 `longTasks` / `fmpPages` / `dimensions` 三组字段
- Core Vitals 面板已按九宫格（LCP/INP/CLS/TTFB/FCP/TTI/TBT/FID/SI）渲染三段式阈值指针 + Deprecated 语义

但 `docs/SPEC.md` §3.3.2 / §4.2 / §5.4.0、`docs/ARCHITECTURE.md` §4.2.1 仍停留在 T2.1.6 验收时的 5 Vitals 口径，形成"代码领先文档"的一致性断裂。

### 指标矩阵缺失（P0 / P1 / P2 分层）

**P0（阻断完整性，本切片落地）**：
1. **SI 后端聚合核实**：SDK 现已上报 `metric='SI'` 事件，但 `PerformanceService.aggregateVitals` 的 `metric IS NOT NULL` 过滤是否真实覆盖 SI、`aggregateTrend` 的 `metric IN (...)` 白名单是否包含 SI 需补验（当前白名单已含 FSP/FID/TTI/TBT，**未显式列 SI**，趋势图可能漏算）
2. **长任务 3 级分级未落地**：SPEC §3.3.2 明确「≥50ms 长任务 / 2-5s 卡顿 / ≥5s 无响应」三级，SDK longTaskPlugin 只按 ≥50ms 单级采集，后端 `aggregateLongTasks` 仅返回 count/totalMs/p75Ms 总量，未分级
3. **FSP 插件（T2.1.2）未落地**：`aggregateWaterfallSamples` 的 `firstScreen` 字段当前用 FCP p75 代偿，SDK 侧 MutationObserver + rAF 采集管线未实现

**P1（体验完整性，本切片一起做）**：
4. **SDK 单元测试缺口**：performance.test.ts（35 case 全绿）已存在，但 longTaskPlugin 与 speedIndexPlugin 新增后未补测试
5. **performance.service 单测缺口**：`aggregateVitals` / `aggregateTrend` / `aggregateWaterfallSamples` / `aggregateLongTasks` / `aggregateFmpPages` 暂无单元测试，ADR-0015 验收时仅做了端到端冒烟
6. **Topbar 时间范围未联动**：`/performance` 页面顶栏时间选择器存在但未写入 URL query，始终以 24h 默认窗口请求

**P2（可感知润色，本切片一起做）**：
7. **Deprecated 面板 Badge**：`VitalConfig.deprecated` 字段已定义但 UI 未渲染可视 Badge（仅在 tooltip 中提及）
8. **瀑布 tooltip 细节**：各阶段 tooltip 应包含 p75 公式说明 + ADR-0015 metric_minute 迁移锚点的 feature-flag 注释

**刻意排除（不在本切片）**：
- Apdex cron（T2.1.5，依赖 Apdex T 项目级可配置，等 T1.1.7 认证）
- 维度扩展到 device model / region / network（依赖 `perf_events_raw` 表扩列，Phase 2 后期）
- `metric_minute` 预聚合（T2.1.4，另起 ADR）

## 决策

### 1. 将上述差距合并为单一里程碑 T2.1.8「性能模块完整性切片」

**不拆分到 T2.1.2 / T2.1.3 / T2.1.7**：因为这些子任务在原路线图中各自独立，但本次 review 发现它们与 SI / 长任务分级 / 面板润色 **共享同一套 DTO + SQL + 面板组件**。一次性交付比分散推进减少三次上下文切换 + 三次回归验证成本。

### 2. 文档先行，代码后置

严格按以下顺序执行，每一步结束前**不进入下一步**：

1. **Phase A 文档一致性**（本 ADR 落地即开始）
   - 写本 ADR-0018 记录 review 结论 + 实施计划
   - 更新 `docs/SPEC.md` §3.3.2（新增 SI 采集方式 + 长任务 3 级阈值 + FSP 占位说明）
   - 更新 `docs/SPEC.md` §4.2（metric 枚举补齐为 10 值，新增 long_task tier 字段）
   - 更新 `docs/SPEC.md` §5.4.0（`PerformanceOverviewDto` 新增 `longTasks` / `fmpPages` / `dimensions` 段 + 计算规则）
   - 更新 `docs/ARCHITECTURE.md` §4.2.1（当前实现反映 longTask + speedIndex 插件 + 扩展 DTO）
   - 更新 `docs/tasks/CURRENT.md`（注册 T2.1.8 + 把 T2.1.2 / T2.1.3 标 `[~]` 挂到 T2.1.8 之下）

2. **Phase B P0 代码实现**
   - 核实 `aggregateVitals` 已覆盖 SI（SQL 不筛 metric，通过 `metric IS NOT NULL` 自动纳入）；为 `aggregateTrend` 的 `metric IN (...)` 白名单加入 `'SI'`
   - 长任务 3 级分级：SDK 以 duration 分类（long_task / jank / unresponsive）写入 `lt_tier`；服务端 `aggregateLongTasks` 扩出 `tiers: { longTask, jank, unresponsive }`；Web 面板由单卡分裂为 3 子卡或 3 色堆叠柱
   - FSP 插件（T2.1.2）：`packages/sdk/src/plugins/fsp.ts` 用 MutationObserver 监听 body 子树变化 + rAF 窗口内记最后一次变动时间戳；dispatch `metric='FSP'` 事件；`demo/ghc-provider.tsx` 注册；服务端 `stages.firstScreen` 切换至 FSP p75

3. **Phase C P1 代码实现**
   - `long-task.test.ts` + `speed-index.test.ts` 按 `performance.test.ts` 测试风格补齐
   - `performance.service.spec.ts` 覆盖 5 条聚合查询（pg-mem 或 testcontainer 二选一）
   - Topbar 时间范围 → URL query：`windowHours=24|48|168` 双向绑定，`router.replace` 不触发 SSR 重走，由 `useSWR`/Server Action 二次 fetch

4. **Phase D P2 代码实现**
   - `VitalConfig.deprecated` 渲染灰底 Badge（"Deprecated"），tooltip 保留替代指标提示
   - 瀑布各阶段 `<Tooltip>` 注入 p75 公式 + metric_minute 迁移注释锚点

### 3. 验收标准

| 维度 | 目标 |
|---|---|
| `pnpm -F @g-heal-claw/sdk test` | 所有新增 case 全绿（longTaskPlugin + speedIndexPlugin + FSP + 原 35 case） |
| `pnpm -F @g-heal-claw/server test` | performance.service.spec.ts 5 聚合函数路径全覆盖；dashboard.service 组合流程 |
| `pnpm -F @g-heal-claw/web typecheck && build` | `/performance` 构建标记 ƒ Dynamic；Deprecated Badge + tooltip 细节在 E2E 手工冒烟通过 |
| `pnpm -F @g-heal-claw/sdk build` | ESM / UMD gzip 体积 ≤ 10KB 预算（新增 FSP 预计 +0.4KB） |
| 文档 | SPEC / ARCHITECTURE / CURRENT / Core Vitals 面板描述 **完全一致于代码实现**，review 零差距 |

## 影响

- **正向**：一次性消除 SDK / SPEC / 大盘 DTO / 面板四层之间的认知偏差；后续 T2.1.4 `metric_minute` 落地有干净的基线
- **负向**：T2.1.8 总工时约 5d，挤占 T1.3.2 Gateway 鉴权节奏；通过「文档分 Phase 交付、代码分 P0/P1/P2 交付」降低单次合并体积
- **兼容性**：`PerformanceOverviewDto` 新增字段皆为**可选**（前端已 fallback 到空值）；SDK 事件 Schema 补字段也采用 optional，旧版 Gateway 不会因 Zod 严格校验拒收

## 备选方案

| 方案 | 理由 | 采用与否 |
|---|---|---|
| A. 把 T2.1.2 / T2.1.3 留在原位分别独立 PR | 保持路线图原始颗粒度 | ❌ 共享 DTO/SQL/面板，分散推进会导致 3 次 DTO 迁移 |
| B. 先完整 T2.1.4 `metric_minute` 再补齐本切片 | 一步到位，无过渡 | ❌ metric_minute 约 3d + 跨表联调，阻塞面板完整性 |
| C. 仅文档对齐不动代码（"代码是事实，文档迁就代码"） | 零工时 | ❌ 指标矩阵确有缺失（FSP / 长任务分级 / SI 趋势白名单），非单纯文档问题 |

**采纳 D（本 ADR）**：文档 → P0 → P1 → P2 四阶段，每阶段用户卡点确认；P0 解决指标矩阵完整性，P1 解决回归保障，P2 解决体验一致性。
