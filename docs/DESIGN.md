# g-heal-claw 技术设计文档

> 版本: 2.0.0 | 日期: 2026-04-27
>
> **文档层级：PRD（什么）→ SPEC（契约）→ ARCHITECTURE（拓扑）→ DESIGN（为什么）**

---

## 1. 文档目标

本文档阐述关键技术选型的理由、重要设计模式、跨模块的横切方案。功能规格见 `SPEC.md`，系统拓扑见 `ARCHITECTURE.md`，本文补齐"为什么这样做"。

---

## 2. 技术选型理由

| 领域 | 选型 | 替代方案 | 选择理由 |
|---|---|---|---|
| 后端框架 | NestJS (Fastify) | Express、Koa、Hono | 模块化 DI、Guards/Pipes/Interceptors 内置、BullMQ/Drizzle 生态成熟；Fastify 吞吐比 Express 高 2-3x |
| 前端框架 | Next.js (App Router) | Vite + React、Remix | SSR 一流、React 19 Server Components 成熟、Vercel/自托管双模部署 |
| AI 框架 | LangChain | 自研 Agent、LlamaIndex、CrewAI | ReAct/Tool 调用原生、与多模型适配器丰富、社区案例多 |
| Monorepo | pnpm + Turborepo | Nx、Lerna、Rush | Turborepo 增量构建和缓存表现最佳；pnpm workspaces 磁盘 + 硬链接开销低 |
| ORM | Drizzle | Prisma、TypeORM | 类型安全 + SQL-first、无运行时客户端、PG 17 特性支持好 |
| 队列 | BullMQ | Kafka、RabbitMQ、NATS | Redis 已在栈内；MVP 不需要 Kafka 级吞吐；轻量、类型友好 |
| 校验 | Zod | Yup、io-ts、Valibot | 一次定义 Schema，DTO / env / API 响应复用；`z.infer` 推导类型 |
| UI 体系 | Shadcn/ui + TailwindCSS v4 · Apple HIG 风格 | Ant Design、MUI | 代码可拥有、定制自由、与 RSC 友好；Tailwind v4 零配置；采用 Apple HIG（SF Pro / iOS System 色板 / Finder 侧栏 / 柔和大散射阴影）降低对比刺眼 |
| 图表 | `@ant-design/plots` (AntV G2) 首版 / ECharts 保留 | Chart.js、Recharts、D3 | AntV G2 React 适配零样板、SSR 友好；重度定制场景保留 ECharts（T2.1.7 评估） |
| 时间库 | dayjs | date-fns、Moment | 体积 2KB、链式 API 与 Moment 一致、本地时区自动识别，统一所有 UTC→本地格式化 |
| 对象存储 | MinIO / S3 | Cloudflare R2、阿里 OSS | S3 协议通用，本地 MinIO 无依赖；后续切云厂家零代码变更 |
| 鉴权 | JWT + Refresh | Session + Cookie | 支持开放 API 与无状态横向扩缩；Refresh Token 规避长 JWT |

**不选 OpenTelemetry Collector 作为入口的原因**：RUM 场景需要项目级 DSN 鉴权、服务端采样、自定义事件（埋点 / 自定义日志），Collector 以 trace/metric/log 为核心，改造成本高。未来 `/ingest/v1/otlp` 作为兼容入口。

---

## 3. SDK 设计

### 3.1 插件化架构

核心仅含生命周期 + 配置 + 队列，采集能力以插件形式注入：

```typescript
interface SdkPlugin {
  name: string;
  setup(hub: Hub): void;
  teardown?(): void;
}

// 内置插件：ErrorPlugin / PerformancePlugin / ApiPlugin / ResourcePlugin /
//          PageViewPlugin / AutoTrackPlugin / WhiteScreenPlugin / ExposurePlugin
```

**理由**：
- **YAGNI** — 用户可按需剔除体积；默认全开保证开箱即用。
- **KISS** — 每个插件单职责，代码行数控制在 200 行内。
- **可测试** — 插件可独立 Mock `hub` 单测。

### 3.2 上报传输层

按优先级自动协商：

```
pagehide / beforeunload → navigator.sendBeacon       // 绝不阻塞页面卸载
SPA 内部批量 flush        → fetch(keepalive:true)
fetch 不可用              → XMLHttpRequest 异步
跨域被 CORS 拦截          → new Image().src (GET, 长度上限 2KB)
```

**Beacon 64KB 约束**：规范规定 sendBeacon 单次体最大 64KB（各浏览器实现有差异）。SDK 在入 Beacon 前先 `JSON.stringify` 后测长度：
- ≤ 60KB（预留 safety margin）直接发送。
- 超过则按事件优先级拆批：`error` / `session_end` / `page_view` > 其余；优先批用 Beacon 发送，剩余事件回滚 IndexedDB 队列。

**数据可靠性**：发送失败的 batch 序列化后写 `IndexedDB`（降级 `localStorage`），SDK 初始化和 `online` 事件触发时重发。

### 3.2.1 跨标签页 Session 同步

同一用户打开多个标签页应共享 `sessionId`，避免 UV 翻倍与会话轨迹断裂：

```
主标签页 init → 读取 localStorage._ghc_session_<projectId>
               → 若不存在，生成 sessionId 并写入 + 触发 storage 事件
其他标签页监听 storage 事件（同源）    → 替换自身内存中的 sessionId
优先级：BroadcastChannel('ghc_session') 存在则走广播；否则 storage 事件兜底
过期判定：任一标签页最近 30min 无事件上报则统一重置
```

**为什么不用 SharedWorker**：浏览器兼容不齐、Service Worker 范围限制、iframe 内 SharedWorker 被限，`BroadcastChannel` + `storage` 事件兼容性与实现复杂度性价比最佳。

### 3.3 采样策略

- **客户端采样** 决定"是否上报"：节省流量与后端压力。
- **服务端采样** 决定"是否存储"：应对突增流量的二次阀门，可动态调整（Redis 配置）。
- **错误默认 100% 采样**、性能 30%、API 30%、埋点 100%，由 DSN 关联的项目配置覆盖。
- **动态采样**（后续）：基于当前后端队列长度，Gateway 在响应中下发 `Server-Sampling`，SDK 下一批次读取。

### 3.4 体积控制

- Rollup + `terser` + `pure` 函数声明，Tree-shaking 友好。
- 外部依赖限制：`error-stack-parser`（2KB）、`ua-parser-js`（可选插件内）。
- Polyfill 不内置，宿主自备；若浏览器不支持 PerformanceObserver 则该插件 no-op。

### 3.5 敏感数据过滤

默认 `beforeSend` 预处理：
- Header / Cookie / QueryString 中 `password / token / authorization / cookie / secret` 字段值替换为 `[FILTERED]`。
- URL 中匹配 `access_token|refresh_token|api_key` 等 query 名隐藏值。
- `requestBody` / `responseBody` 超过 4KB 截断，Content-Type 非 `json/text/form` 则丢弃。

---

## 4. 指纹与聚合

### 4.1 指纹规则

```
fingerprint = sha1(
  `${subType}|${normalize(message)}|${topFrame.file}|${topFrame.function}`
)
```

其中 `normalize(message)`：
- 去除数字 / UUID / hash。
- 去除文件路径中的版本号。
- 保留可诊断关键词。

**为什么不把整个 stack 入指纹**：同一个 bug 在不同调用链下堆栈差异大，过细会产生指纹爆炸。顶部 frame 已足够区分绝大多数 bug。

### 4.2 聚合锁

Issue UPSERT 存在并发写风险（两条事件同一指纹同时到达）。采用：
```sql
INSERT ... ON CONFLICT (project_id, fingerprint)
DO UPDATE SET
  event_count = issues.event_count + 1,
  last_seen = EXCLUDED.last_seen;
```

高频 Issue 使用 Redis HyperLogLog 估算 `user_count`，每分钟批量回写 PG。

---

## 5. 数据库设计模式

### 5.1 事件原始表分区

- `events_raw` 按 `ingested_at` 周分区（`PARTITION BY RANGE`）。
- 热分区保留 `BRIN` 索引（时间范围）+ `GIN` 索引（`payload jsonb_path_ops`）。
- 冷分区 `DETACH PARTITION` 后归档 S3，查询时触发透明恢复（P2 阶段）。

### 5.2 指标聚合

#### 5.2.1 长期目标（T2.1.4 之后）

- `metric_minute` 按 `bucket_ts` 月分区。
- 查询路径：
  - < 1h：`metric_minute`（分钟粒度）
  - 1h-7d：物化视图 `metric_hour`（小时聚合）
  - 7d+：物化视图 `metric_day`（天聚合）
- 物化视图通过 pg_cron 每 5 分钟刷新增量。

#### 5.2.2 过渡期：直查 `perf_events_raw` + `percentile_cont`（ADR-0015）

**为什么先直查**：
- demo 阶段事件量 < M 级，`percentile_cont` 单次查询 < 50ms，对 QPS 低的 Dashboard 页面完全够用。
- 零新表、零运维面（无物化视图刷新 cron）、与既有索引 `idx_perf_project_metric_ts` / `idx_perf_project_path_ts` 完全对齐。
- Controller 契约（见 SPEC §5.4.0）与未来预聚合完全解耦，切换时前端零感知。

**为什么选 p75 而非 p95**：
- Google Core Web Vitals 官方阈值以 p75 为基线（75% 真实用户体验 `good` 视为达标）。
- 与 `rating` 字段语义一致：`value ≤ good-threshold` 时 rating=good，p75 做聚合后落到 `good` 区间即全站达标。
- 瀑布图取样本**中位数（p50）**而非 p75：瀑布展示"一般情况"而非尾部压线，中位数采样 200 条即稳定。

**整体指标与串行阶段分离**：`firstScreen` / `lcp` 从 0 起是整体指标（代表用户观感）；`dns → tcp → ssl → request → response → domParse → resourceLoad` 是串行累积（代表网络/渲染物理过程）。混画到同一瀑布图时需视觉区分（前者从 0 起、后者 cursor 串接）。

#### 5.2.3 异常事件切片：`error_events_raw` + 字面分组（ADR-0016）

**为什么单表不入队、不指纹聚合**：
- 切片阶段（T1.2.2 / T1.4.0 / T1.6.2.0）的目标是"SDK → 落库 → 大盘"端到端先跑通，指纹算法依赖 Sourcemap 还原（T1.5），二者必须串行。
- 与 `perf_events_raw` 完全对偶：Gateway 直调 `ErrorsService.saveBatch()`，事件独立行，`event_id UNIQUE` 幂等，保留未来接入 BullMQ `events-error` 的切换口（T1.3.2）。

**为什么 UI 分组键选 `(sub_type, message_head)`**：
- `message_head = message.slice(0, 128)` 入库时物化为独立列并加 `idx_err_project_group_ts` 索引（`(project_id, sub_type, message_head, ts_ms DESC)`），查询零计算开销。
- 字面分组对"带数字/ID"的错误粒度偏粗（如 `Request failed 429 /api/x/123`），MVP 可接受；T1.4.2 指纹落地后查询键切到 `fingerprint`，API 契约不变（Controller 字段命名保持 `messageHead` 即可复用）。

**为什么 Top 分组直查而非预聚合**：
- demo 事件量级下，`GROUP BY (sub_type, message_head)` + `ORDER BY count DESC LIMIT N` 在 `idx_err_project_group_ts` 上单查询 < 20ms。
- 预聚合需额外的 `error_issues` 表 + Processor Worker，属于 T1.4.1 范围，不阻塞切片交付。

**环比语义反转（对偶性能大盘）**：异常 `deltaDirection=up` 表示恶化（UI 红色 `destructive`），`down` 表示改善（UI 绿色 `good`）；性能 `up` 表示指标变大（LCP 延迟恶化）同为 destructive，math 完全一致。

### 5.3 去重与幂等

- SDK 生成 `eventId` (UUID v7)，Gateway 写入 Redis `SETNX eventId EX 3600`，命中即丢弃。
- 幂等保护重发场景（网络抖动触发 SDK 重试）。

---

## 6. 限流与配额

### 6.1 项目级限流

- 令牌桶：`gateway:ratelimit:<projectId>`，默认 100 events/s，峰值 200 burst。
- Lua 脚本原子扣减，Redis 单节点 > 200k ops/s 无瓶颈。
- 超限返回 `429 Retry-After`。

### 6.2 多维度配额

- 项目配额：日/月总量。
- 事件类型配额：性能、API 单独配额，避免某一类事件吃满。
- 超额策略：软限（只记录不阻断）、硬限（丢弃 + 面板预警）。

---

## 7. 告警引擎设计

### 7.1 Pull vs Push

选择 **Pull（定时扫描）** 而非 Push（事件触发）原因：
- 告警条件多为"窗口统计"（过去 5 分钟错误率），天然需要窗口边界。
- 实现简单，规则变更不影响历史事件。
- 精度 1 分钟对用户体验足够。

### 7.2 评估流程

```
alert-evaluator (cron 每分钟)
  ├─ 加载启用规则（缓存 30s）
  ├─ 按规则并行查询 metric_minute（窗口聚合）
  ├─ 对比阈值与静默期
  ├─ 触发：
  │    · 写 alert_history（firing）
  │    · BullMQ notifications
  └─ 消除：满足条件 resolved 再发一次通知
```

### 7.3 去重与静默

- 规则级静默期（`cooldownMs`）：状态机 firing 期间不重复发送。
- 项目级抑制：配置"组合规则"，高优规则触发时抑制低优规则（P1 阶段）。

---

## 8. AI Agent 设计

### 8.1 诊断 Prompt 结构

```
System:
  你是资深前端工程师，任务是诊断生产环境异常并给出修复建议。
  - 必须基于提供的代码上下文，不得臆造。
  - 输出 JSON：{ rootCause, evidence, suggestedFix, confidence }

User:
  # Issue
  {{issue.title}}
  # Stack（已 Sourcemap 还原）
  {{stack}}
  # Breadcrumbs
  {{breadcrumbs}}
  # 相关代码片段
  {{codeSnippets}}
```

- 使用 Claude Opus 4.7 作为主模型；失败降级 GPT-4.x。
- 启用 **prompt caching**：仓库代码切片常驻缓存命中率 > 80%。

### 8.2 ReAct 循环

```
Thought: 堆栈顶是 parseInt，接收 string | undefined。猜测 undefined 触发 NaN。
Action: readFile("src/utils/number.ts")
Observation: function parseNumber(raw: string) { return parseInt(raw, 10) }
Thought: 签名不允许 undefined。
Action: grepRepo("parseNumber\\(")
Observation: ... 5 处调用 ...
Thought: 所有调用应在入口处 `?? ''`。
Action: writePatch(<diff>)
Action: runSandbox("pnpm lint && pnpm test")
Observation: ✅ passed
Action: createPr(...)
```

**护栏**：
- 单任务最大 Step 数（默认 20）。
- 单次 patch 最大 LOC（`heal.maxLoc`）。
- 路径白名单 / 禁止名单（`heal.paths` / `heal.forbidden`）。
- 所有 Tool 调用与模型响应写入 `heal_job.trace`。

### 8.3 Verify 沙箱

- Docker 镜像：默认 `node:20-alpine`（通过 `HEAL_SANDBOX_IMAGE` 可替换为 `node:22-alpine` 或项目自有镜像）。
- **Node 版本兼容**：Agent 读取仓库 `.nvmrc` / `package.json#engines.node`，若与默认不匹配自动切换到对应 `node:<ver>-alpine`，镜像缺失则构建失败并提示。
- 只读 mount 仓库快照 → 覆盖 patch → 按 `heal.verify` 指定命令运行。
- 网络策略：默认 `--network none`；若 `heal.allowNetwork=true` 则限定到 npm registry 内网 mirror。
- 超时 10 分钟（可由 `HEAL_SANDBOX_TIMEOUT_MS` 调节），内存上限 2GB（`HEAL_SANDBOX_MEMORY_MB`）。
- 沙箱退出码 ≠ 0 视为 verify 失败，进入 `failed` 状态并写入 stderr 尾部 1000 行。

---

## 9. 跨模块横切设计

### 9.1 统一错误处理

- `AppException extends HttpException` 含 `code` / `message` / `details`。
- `GlobalExceptionFilter` 捕获所有异常，返回统一错误响应。
- 日志包含 `requestId`，从 Nginx `X-Request-Id` header 或自动生成。

### 9.2 日志

- 使用 `nestjs-pino`，输出结构化 JSON。
- 字段统一：`level`、`time`、`msg`、`requestId`、`projectId`、`module`。
- 生产环境输出到 stdout，由 Fluent Bit 收集到 Loki/ELK。

### 9.3 配置管理

- `packages/shared/env.ts` 定义 Zod Schema，所有服务启动时校验。
- 禁止直接访问 `process.env`；由各服务的 `ConfigService` 提供强类型读取。
- 秘密（DB 密码、API Key）通过 K8s Secret 挂载 env，本地用 `.env.local`。

### 9.4 对象存储封装

- `StorageService` 抽象：`put / get / delete / presignGet / presignPut`。
- 实现：`S3Storage`（AWS / MinIO 兼容），未来可加 `OssStorage`（阿里）。
- 大字段（原始事件超 4KB、patch、诊断 Markdown）通过 Storage 存储，DB 只存引用。

### 9.5 缓存设计

| 用途 | Key 前缀 | TTL |
|---|---|---|
| DSN → projectId | `gateway:dsn:<publicKey>` | 5 min |
| 限流令牌桶 | `gateway:ratelimit:<projectId>` | 1 s 滑窗 |
| 幂等 eventId | `gateway:dedup:<eventId>` | 1 h |
| Sourcemap 预热 | `sourcemap:release:<projectId>:<release>` | 1 h |
| Dashboard 查询结果 | `dashboard:cache:<sha>` | 30 s |
| 告警规则 | `alert:rules:<projectId>` | 30 s |

所有缓存写入使用 JSON 序列化 + Zod 反序列化校验，防止缓存脏数据污染。

---

## 10. 性能优化关键点

### 10.1 Gateway 热路径

- Fastify + `reply.hijack()` 快速入队后立即返回 `202`，不等 BullMQ ACK。
- Zod Schema 预编译为函数（`Zod 3.x` 已优化），避免每次新建 Schema 对象。
- 批量事件使用 `Promise.all` 并行入队，单次 HTTP 处理多事件。

### 10.2 Dashboard 查询

- 所有大盘查询先走缓存，缓存失效时再查物化视图。
- `EXPLAIN ANALYZE` 驱动的索引审计：每个慢查询 > 200ms 都必须加索引或重写。
- 前端使用 `react-query` 缓存 + 增量加载（`cursor` 分页非 `offset`）。

### 10.3 SDK 首屏开销

- 主包仅核心 + 错误插件（立即加载）。
- 性能、API、资源、埋点插件在 `requestIdleCallback` 中初始化。
- 页面加载完成前缓存事件，加载后统一 flush。

---

## 11. 测试策略

| 层次 | 覆盖对象 | 工具 |
|---|---|---|
| 单元 | Service、工具函数、Zod Schema | Vitest |
| 模块 | NestJS 模块（含 DB mock） | NestJS TestingModule + pg-mem |
| 集成 | Gateway → Processor → DB 端到端 | Dockerized PG/Redis + 真实队列 |
| 端到端 | Dashboard 关键流程 | Playwright |
| SDK 浏览器 | SDK 运行时行为 | Playwright + jsdom 补齐 |
| 契约 | SDK ↔ Gateway、Dashboard ↔ 前端 | Zod Schema 双端复用（天然契约） |
| 压测 | Gateway 吞吐、Processor 消费速率 | k6、autocannon |

**测试数据库禁止 mock**，一律使用 Dockerized PG；mock 过的 DB 无法真正验证 Migration。

---

## 12. 可观测性（自举）

- **日志**：Pino JSON → Loki。
- **指标**：Prometheus `/metrics`，Dashboard 端的 Web Vitals 由自家 SDK 监控自家前端。
- **追踪**：OpenTelemetry，`Gateway → Processor → DB` 全链路 trace，通过环境变量可开关。
- **健康检查**：`/healthz`（liveness） + `/readyz`（PG/Redis/Storage 可用性）。

---

## 13. 安全设计

- 所有对外 HTTP 强制 TLS；Gateway 接受 `X-Forwarded-Proto` 判断。
- DSN `publicKey` 暴露前端，鉴权仅做项目匹配与黑名单；`secretKey` 仅用于后台上传。
- CSRF：Dashboard 使用 SameSite=Strict Cookie + Double Submit Token。
- XSS：前端使用 React 默认转义，禁止 `dangerouslySetInnerHTML`（Lint 禁用）。
- SQL 注入：Drizzle 参数化查询，禁止字符串拼接。
- 依赖安全：pnpm audit + Renovate 自动升级补丁版本。
- 数据脱敏：DB 字段 `email` / `user_id` 查询需权限；导出数据脱敏中间件。

---

## 14. 演进与放弃项

**明确放弃（MVP 不做）**：
- Session Replay（录屏）— 法律 / 体积 / 存储成本高。
- Heatmap（热力图）— 复用埋点数据可后期拼装。
- 小程序监控内置 — P1 阶段提供独立 SDK。
- APM（服务端链路追踪）— 本项目聚焦前端；通过 TraceID 串联后端存量 APM。

**未来放开**：
- 数据驻留（EU / CN 区域部署） — 影响架构分区，P3 再做。
- 自研模型微调 — 在 heal_job 积累 1000+ 正例后评估。
- Edge SDK（Worker 环境） — Cloudflare/Vercel Edge 可运行的精简版。

---

## 15. 关键决策记录索引

| 编号 | 决策 | 状态 |
|---|---|---|
| ADR-0001 | 模块化单体而非微服务 | 采纳 |
| ADR-0002 | BullMQ 而非 Kafka（MVP） | 采纳 |
| ADR-0003 | Drizzle 而非 Prisma | 采纳 |
| ADR-0004 | AI Agent 独立进程 | 采纳 |
| ADR-0005 | Sourcemap 服务端还原（非客户端） | 采纳 |
| ADR-0006 | Pull 式告警引擎 | 采纳 |
| ADR-0007 | 实时推送走 Redis Pub/Sub + SSE（非 WebSocket） | 采纳 |
| ADR-0008 | 跨标签页 Session 同步走 BroadcastChannel + storage | 采纳 |
| ADR-0013 | 性能事件持久化切片：Gateway 直调 PerformanceService → `perf_events_raw` 单表（暂不入队） | 采纳 |
| ADR-0014 | SDK PerformancePlugin 引入 `web-vitals@^4` + 自采 Navigation 瀑布 | 采纳 |
| ADR-0015 | Dashboard 性能大盘 API 首版：`/dashboard/v1/performance/overview` 直查 + p75 聚合 | 采纳 |
| ADR-0016 | 异常监控闭环切片：SDK `errorPlugin` + `error_events_raw` 单表 + `/dashboard/v1/errors/overview` 字面分组聚合 | 采纳 |

详细决策文档按需在 `docs/decisions/` 下新增，模板与完整索引见 `docs/decisions/README.md`。
