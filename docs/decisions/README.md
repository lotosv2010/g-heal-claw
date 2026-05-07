# 决策记录（Decisions）

> 此目录存放对项目长期产生影响的架构、技术选型、流程与运营决策，采用 ADR（Architecture Decision Record）格式撰写。每次重要权衡落地后新增一份文件。

## 命名与模板

- 文件名：`NNNN-slug.md`，其中 `NNNN` 为四位递增编号（ADR-0001、ADR-0002…）。
- 建议模板：

```markdown
# ADR-NNNN: 决策标题

| 字段 | 值 |
|---|---|
| 状态 | 提议 / 采纳 / 废弃 / 被 ADR-XXXX 取代 |
| 日期 | YYYY-MM-DD |
| 决策人 | @name |

## 背景
（为什么需要这个决策，约束是什么）

## 决策
（具体选择了什么方案）

## 备选方案
（考虑过哪些，为什么不选）

## 影响
（成本 / 收益 / 风险）

## 后续
（相关依赖改动、跟踪事项）
```

## 索引

现阶段重要决策摘录，详细文档按需补全：

| 编号 | 决策 | 状态 |
|---|---|---|
| ADR-0001 | 模块化单体 NestJS 而非微服务 | 采纳 |
| ADR-0002 | MVP 使用 BullMQ 而非 Kafka | 采纳 |
| ADR-0003 | 使用 Drizzle 而非 Prisma 作为 ORM | 采纳 |
| ADR-0004 | AI Agent 独立进程部署 | 采纳 |
| ADR-0005 | Sourcemap 服务端还原（非客户端） | 采纳 |
| ADR-0006 | 告警引擎采用 Pull 式定时评估 | 采纳 |
| ADR-0007 | 实时推送走 Redis Pub/Sub + SSE（非 WebSocket） | 采纳 |
| ADR-0008 | 跨标签页 Session 同步走 BroadcastChannel + storage | 采纳 |
| [ADR-0009](./0009-shared-package-baseline.md) | packages/shared 基线：Env Schema + parseEnv 纯函数、按 app 切片、tsc 直出、一子类型一文件 | 采纳 |
| [ADR-0010](./0010-sdk-skeleton-and-examples.md) | SDK 骨架边界 + examples/ 目录（Next.js demo）+ Vite Library Mode（ESM + UMD） | 采纳 |
| [ADR-0011](./0011-server-skeleton.md) | apps/server 骨架：NestJS + Fastify + Gateway 收端（不入队 / 不落库 / 不鉴权） | 采纳 |
| [ADR-0012](./0012-web-skeleton.md) | apps/web 骨架：Next.js App Router + 10 页路由 + 仅落地"页面性能"（手写 UI 原语 / CSS 趋势条 / mock fixture） | 采纳 |
| [ADR-0013](./0013-performance-persistence.md) | 性能数据持久化切片：Drizzle + postgres.js + `perf_events_raw` 单表，Gateway 直调 PerformanceService（暂不入队） | 采纳 |
| [ADR-0014](./0014-sdk-performance-plugin.md) | SDK PerformancePlugin：引入 `web-vitals@^4` 采集 LCP/FCP/CLS/INP/TTFB + SDK 自采 Navigation 瀑布，映射到 `PerformanceEventSchema` | 采纳 |
| [ADR-0015](./0015-dashboard-performance-api.md) | Dashboard 性能大盘 API 首版：DashboardModule 直查 `perf_events_raw` 做 p75 聚合，Web 端走 `NEXT_PUBLIC_DEFAULT_PROJECT_ID` + `NEXT_PUBLIC_API_BASE_URL` | 采纳 |
| [ADR-0016](./0016-error-monitoring-slice.md) | 异常监控闭环切片：SDK ErrorPlugin（window.error + unhandledrejection + 资源 capture）+ `error_events_raw` 单表 + Dashboard `(subType, message_head)` 字面分组直查聚合 | 采纳 |
| [ADR-0017](./0017-drizzle-schema-baseline.md) | Drizzle Schema 首版基线：多租户主表 8 张（users / projects / project_keys / project_members / environments / releases / issues / events_raw 分区）+ 前缀 nanoid 主键 + drizzle-kit 迁移源真值 | 采纳 |
| [ADR-0018](./0018-performance-module-gap-slice.md) | 性能监控模块完整性切片（T2.1.8）：longTask / speedIndex 插件补齐 + `PerformanceEventSchema.metric` 9 值（新增 FSP/FID/TTI/TBT/SI）+ Dashboard longTasks/fmpPages/dimensions + Core Vitals 九宫格三段式阈值指针 | 采纳 |
| [ADR-0019](./0019-errors-module-taxonomy-and-test-placement.md) | 异常监控模块 9 类目扩展（category 字段 + httpPlugin + ErrorsService 9 rollup + Web `/errors` 重构）+ 测试文件统一放置规则（`tests/`，`src/**/*.{test,spec}.{ts,tsx}` 判为违规） | 采纳 |
| [ADR-0020](./0020-menu-delivery-roadmap.md) | 菜单完整化交付路线图（8 个占位页 → live 分 Tier 推进）：Tier 1 api/resources/custom/logs；Tier 2 visits/projects/realtime（依赖 JWT+RBAC 与协议 ADR）；Tier 3 overview 收口 | 采纳 |
| [ADR-0022](./0022-resource-monitoring-slice.md) | 静态资源监控切片（TM.1.B）：独立 `resourcePlugin`（PerformanceObserver 采全量 RT + 6 类分类）+ `resource_events_raw` + `ResourceMonitorModule` 聚合 + `/monitor/resources` 大盘；与 errorPlugin（DOM error）/ apiPlugin（fetch/XHR）三条链路边界清晰 | 采纳 |
| [ADR-0023](./0023-custom-and-logs-slice.md) | 自定义上报 + 日志查询切片（TM.1.C）：`customPlugin` 主动业务 API（track/time/log/captureMessage）+ 3 张独立 raw 表 + `CustomModule` / `LogsModule` + `/tracking/custom` 与 `/monitor/logs` 双大盘；与 trackPlugin 被动 DOM 采集在 type 维度完全独立 | 采纳 |
| [ADR-0025](./0025-server-directory-by-entry-boundary.md) | apps/server 按入口边界重构：`gateway/`（SDK 写）保持；`dashboard/` 按 web 4 组菜单分级（monitor/tracking/settings）；业务域模块统一沉到 `modules/`；`api-monitor`→`api`、`resource-monitor`→`resources` 统一命名；零行为变更（路由 / 队列 / 表名 / 契约不变） | 采纳 |
| [ADR-0026](./0026-error-processor-bullmq-takeover.md) | ErrorProcessor BullMQ 接管：Gateway 同步直调 → `events-error` 异步消费 + `SourcemapService` 骨架（resolveFrames stub，待 T1.5.3 实现）+ `events_raw` 分区维护 cron；`ERROR_PROCESSOR_MODE=sync\|queue\|dual` 灰度开关；零 SDK/Web 契约变更 | 采纳 |
| [ADR-0027](./0027-tracking-funnel-slice.md) | 转化漏斗分析切片（TM.2.D）：无状态 URL 驱动（`steps=A,B,C` query）+ 单 SQL CTE 逐步推进 + `TrackingService.aggregateFunnel` + `/dashboard/v1/tracking/funnel` + `/tracking/funnel` live 页；复用 `track_events_raw`，零 SDK / 零新表；持久化漏斗 + A/B 对比 + 流失下钻推迟 | 采纳 |
| [ADR-0028](./0028-tracking-retention-slice.md) | 用户留存分析切片（TM.2.E）：无状态 URL 驱动（`cohortDays=7&returnDays=7&identity=session` query）+ 单 CTE 两步计算（first_seen + day_offset）+ `TrackingService.aggregateRetention` + `/dashboard/v1/tracking/retention` + `/tracking/retention` live 页；复用 `page_view_raw`，零 SDK / 零新表；持久化 Cohort + 周月粒度 + 渠道下钻推迟 | 采纳 |
| [ADR-0029](./0029-dashboard-overview-slice.md) | 数据总览切片（TM.3.A）：5 域 MVP（errors/performance/api/resources/visits）`Promise.allSettled` 并发聚合 + 全站健康度加权公式（错误率 40% + LCP 25% + API 错误率 20% + 资源失败率 15%）+ `/dashboard/v1/overview/summary` + `/dashboard/overview` live 页；零 SDK / 零新表；custom/logs/tracking 扩展推迟 | 采纳 |
| [ADR-0030](./0030-dashboard-realtime-slice.md) | 实时监控切片（TM.2.C）：选"平台实时大盘"形态（非用户应用 WS 观测）+ Redis Pub/Sub + Streams (MAXLEN 1000) + SSE `/api/v1/stream/realtime` + 3 topics (error/api/perf) + `RealtimeModule` 订阅池 + `/dashboard/realtime` live 页；沿用 ADR-0007；用户应用 WS/SSE 观测留作独立切片 | 采纳 |
| [ADR-0031](./0031-sourcemap-service.md) | Sourcemap 服务实装（M1.5 T1.5.1~T1.5.4）：`release_artifacts` 新表 + `S3StorageService`（`@aws-sdk/client-s3` · MinIO 兼容）+ `SourcemapService.resolveFrames` 真实实现（source-map v0.7 WASM + LRU 100 条 consumer）+ `SourcemapController` Release CRUD + Artifact multipart 上传 + `ApiKeyGuard`（X-Api-Key + project_keys.secret_key）；ErrorProcessor 零变更（接口不变）；CLI + Vite 插件推迟 | 采纳 |
| [ADR-0032](./0032-auth-module-mvp.md) | 认证与项目管理 MVP（T1.1.7）：bcrypt 密码哈希 + JWT 1h + Refresh Token 7d（Redis 存储）+ JwtAuthGuard / ProjectGuard / RolesGuard 三层守卫 + `/api/v1/auth/*` 认证 + `/api/v1/projects/*` 项目 CRUD + 成员 RBAC + Token 管理；DashboardModule 渐进式接入 ProjectGuard | 采纳 |
| [ADR-0033](./0033-settings-web-ui.md) | Settings 管理页面 Web UI（TM.2.B）：4 页 CRUD（projects/members/tokens/sourcemaps）+ Sourcemap Dashboard 代理端点（JWT 鉴权）+ projectId URL 参数 + cookie 记忆；统一 Client Component CRUD + Server Component 首屏；UI 原语补齐 dialog + select | 采纳 |
| [ADR-0034](./0034-sdk-transport-breadcrumb.md) | SDK 传输层升级（T1.2.3~T1.2.6）：批量队列（maxBatchSize=30 + flushInterval=5s）+ 多通道协商（beacon→fetch→image）+ Beacon 64KB 拆批 + IndexedDB 离线兜底（500 上限 × 3 次重试）+ breadcrumbPlugin 自动采集 5 种轨迹 | 采纳 |
| [ADR-0035](./0035-alert-engine-mvp.md) | 告警引擎 MVP（Phase 4）：AlertModule（规则 CRUD + cron 评估 + firing/resolved 状态机）+ NotificationModule（5 渠道 Provider：email/dingtalk/wecom/slack/webhook + BullMQ Worker + 模板渲染）+ 3 张表 + 预置规则 + Web 管理页面；短信/自愈联动推迟 | 采纳 |
| [ADR-0036](./0036-ai-heal-agent-mvp.md) | AI 自愈 Agent MVP（Phase 5）：`apps/ai-agent` 纯 Node.js + LangChain ReAct + BullMQ 双向队列 + 5 Tools（readIssue/readFile/grepRepo/writePatch/createPr）+ `heal_jobs` 状态机 + HealModule API；Docker 沙箱/GitLab/Web UI 推迟 | 采纳 |

> 当你需要为某条决策补充详细背景或推翻旧决策时，请新增 `0001-xxx.md`（而非修改旧文件），并在此索引更新状态。
