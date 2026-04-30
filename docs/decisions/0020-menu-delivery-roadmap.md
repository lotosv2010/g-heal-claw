# ADR-0020 菜单完整化交付路线图（8 个占位页 → live）

- 日期：2026-04-29
- 状态：已接受
- 决策人：Robin
- 关联：
  - `docs/tasks/CURRENT.md` Phase 1~3 任务清单
  - ADR-0016 异常监控切片
  - ADR-0018 性能模块完整性切片
  - ADR-0019 异常模块 9 类目 + 测试放置

## 1. 背景

侧边栏 10 个菜单中当前已 live：`performance`、`errors`；其余 8 个仍为 PlaceholderPage。
继续推进"端到端深挖单一模块"会导致产品形态在外部视角长期不完整。
先把菜单铺满、每个页面最小可用，再回头深化每条数据链路。

## 2. 决策

以"菜单完整性"为本阶段主题，按依赖关系分三 Tier，每 Tier 可独立上线：

### Tier 1（数据源已在 SDK 侧采集 / 无认证依赖 / ~10 人日）

| 菜单 | 前置 | 工期 | 备注 |
|---|---|---|---|
| `api` API 监控 | SDK httpPlugin 已采 ajax/api_code | 3d | 新增 `apiPlugin`（type='api'）+ `api_events_raw` 表 + 聚合大盘 |
| `resources` 静态资源 | 新增 ResourcePlugin | 3d | `PerformanceResourceTiming` → `resource_events_raw` |
| `custom` + `logs` 合并切片 | SDK `track/log` API | 4d | 新建 `custom_events_raw` / `custom_logs_raw`；前端共用筛选框架 |

### Tier 2（引入新依赖 / 需 ADR 定协议）

| 菜单 | 前置 | 工期 | 备注 |
|---|---|---|---|
| `visits` 页面访问 | GEOIP_DB_PATH 运维 / PageViewPlugin | 5d | IP 地域库 + `page_view_raw` + 会话聚合 |
| `projects` 应用管理 | **T1.1.7 JWT + RBAC 先行** | 7d | 认证 MVP (4d) + 项目 CRUD / API Token (3d) |
| `realtime` 通信监控 | **新 ADR 定协议范围** | 5d | 先写 WebSocket/SSE 监控 ADR，再落采集 + 大盘 |

### Tier 3（收口）

| 菜单 | 工期 | 备注 |
|---|---|---|
| `overview` 数据总览 | 2d | 拼接前 9 个模块的汇总卡片 + 全站健康度 |

## 3. 范围与非范围

### 本轮范围（Tier 1）
- `api_events_raw` / `resource_events_raw` / `custom_events_raw` / `custom_logs_raw` 四张 raw 表
- SDK：`apiPlugin`、`resourcePlugin`、`trackPlugin`、`logPlugin`（type 各自独立，避免把 ajax 失败混入 api 监控）
- Dashboard：4 个 `<菜单>Service` + `<菜单>Controller` + Zod DTO
- Web：4 个页面 live 化，复用 `ThresholdTone` / `DeltaDirection` / 三态 source

### 非范围（推迟）
- API TraceID 注入（T2.2.3，Tier 1 只做采集 + 聚合）
- `metric_minute` 分钟预聚合（Tier 2 之后）
- 埋点 `AutoTrackPlugin`（`data-track` 自动采集，Phase 3 末）
- 资源类型分类细化（CDN 测速、慢资源 Top 单独切片）

## 4. 关键设计决策

### 4.1 API 监控：新 `apiPlugin` 与现有 `httpPlugin` 并存

- `httpPlugin` 仍负责：非 2xx / 网络层失败 / api_code 业务异常 → type='error'
- `apiPlugin` 负责：所有 fetch/XHR 请求的明细采集 → type='api'（含成功请求）
- 两条数据链路互不影响：异常入 `error_events_raw`，明细入 `api_events_raw`
- 共享 URL 采集逻辑：抽 `sdk/src/plugins/http-capture.ts` 公共纯函数
- 面板差异：errors 看类目卡 / API 看吞吐趋势 + 慢请求 Top + 错误率

### 4.2 raw 表统一设计

所有 raw 表共同约束：
- `(project_id, ts_ms)` 复合索引，24h / 7d / 30d 窗口扫描优化
- `event_id` UNIQUE 约束（幂等）
- `session_id` 列，供 DISTINCT 估算
- 30d TTL 由后续 `pg_cron` 脚本清理（本轮手动 prune）

### 4.3 前端页面模板化

复用 `errors` 页面的结构：
- 顶部 CategoryCards（api 没有 category，改为 statusCode 分布）
- DimensionTabs（browser / os / device_type / host / pathTemplate）
- RankingTable（API 按 p75 duration 倒序 / Resource 按 failure_rate 倒序）
- StackChart（按 hour 堆叠）

## 5. 迁移策略

- 4 张 raw 表通过新 drizzle migration `0004_menu_raws.sql` 统一加入
- 已有 `error_events_raw` / `perf_events_raw` 保留
- 新 SDK 插件默认**不启用**，demo `ghc-provider.tsx` 按需注册
- 老 DSN 的 SDK 版本不会上报新 type，直接跳过

## 6. 验收

- 6 个新菜单（api / resources / custom / logs / visits / projects / realtime）逐一从 Placeholder → 可 live 渲染真实数据
- 每个页面与 `errors` 页面保持三态 `live | empty | error` 契约
- Tier 1 完成后：`pnpm typecheck` 7/7 + `pnpm build` 5/5 保持；server 单元 ≥130；新增 Playwright 可选

## 7. 风险

- 4 个页面的并行开发易引入重复样板代码；抽 `lib/dashboard-page-template.tsx` 前先落 2 个再抽
- `custom` 菜单涉及"用户业务定义字段"→ UI 过度扩展会拖累进度；本轮只做 3 列（eventName / sampleCount / lastSeen）
- `visits` 的 GeoIP 库许可证需确认（MaxMind GeoLite2 免费但需注册）

## 8. 后续（Tier 2.A 实际落地摘要 · 2026-04-30）

为缩短首切片到约 2.5d，**Tier 2.A 仅落地简化版 visits**：

- 落地：SDK `pageViewPlugin`（硬刷新 + history patch）+ `page_view_raw` raw 表 + `VisitsModule`（saveBatch + 4 聚合）+ `/dashboard/v1/visits/overview` + Web `/monitor/visits` live 页面（PV/UV/SPA占比/刷新占比/TopPages/TopReferrers + 三态 SourceBadge）+ demo 场景 `/visits/page-view`
- 推迟（独立增量切片再评估）：GeoIP 地域分布、`page_duration` 停留时长插件、`session_raw` 会话聚合、UTM 渠道归因
- Demo 路径：`examples/nextjs-demo/app/(demo)/visits/page-view/page.tsx`（SPA 导航 / reload / popstate 3 按钮）
- 使用说明：`apps/docs/docs/sdk/page-view.mdx`（SDK 接入）+ `apps/docs/docs/guide/dashboard/visits.mdx`（后台用法）
- 任务 ID：TM.2.A.1 ~ TM.2.A.7（全部 `[x]`，见 `docs/tasks/CURRENT.md`）

### 8.1 Tier 2.D `tracking/funnel` 实际落地摘要（ADR-0027 · 2026-04-30）

零 SDK / 零新表 / 零 RBAC 依赖，URL 驱动的无状态切片：

- 落地：`TrackingService.aggregateFunnel`（动态 N 步 CTE，2~8 步 + `stepWindowMs` 约束 + 用户级去重）+ `DashboardFunnelService/Controller`（装配层计算 `conversionFromPrev/conversionFromFirst/overallConversion`，4 位小数）+ Web `/tracking/funnel` live 页面（URL 驱动配置表单 + SummaryCards + FunnelChart + StepsTable + 三态 SourceBadge）+ demo 场景 `/tracking/funnel` 三步按钮
- 推迟（独立增量切片）：持久化 funnels 表（命名漏斗 / 收藏 / 邮件订阅）、A/B 对比、流失下钻（UA / 地域 / 页面）、多窗口并排对比
- Demo 路径：`examples/nextjs-demo/app/(demo)/tracking/funnel/page.tsx`（view_home → click_cta → submit_form 3 按钮）
- 使用说明：`apps/docs/docs/guide/tracking/funnel.md`（URL 参数表 · 字段口径 · 验证链路 · 常见问题）
- 任务 ID：TM.2.D.1 ~ TM.2.D.5（全部 `[x]`，见 `docs/tasks/CURRENT.md`）
