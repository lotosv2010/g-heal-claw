# ADR-0026: ErrorProcessor BullMQ 接管（Gateway 同步直调 → 异步消费 + Sourcemap 可选注入 + 分区维护 cron）

| 字段 | 值 |
|---|---|
| 状态 | 采纳（2026-04-30 落地） |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |
| 关联 | ADR-0002（MVP 使用 BullMQ 而非 Kafka）/ ADR-0005（Sourcemap 服务端还原）/ ADR-0016（异常监控闭环切片）/ ADR-0017（Drizzle Schema 基线 + `events_raw` 分区）/ ADR-0019（异常 9 类目扩展）/ ADR-0025（server 入口边界重构） |

## 背景

ADR-0016 / T1.4.1 将异常链路以「切片方案」落地（commit `35a029e`）：Gateway 收到 `type='error'` 事件后**进程内直调** `ErrorsService.saveBatch()`，完成 `error_events_raw` 落库 + 指纹聚合 UPSERT `issues` + HLL pfadd + DLQ 兜底。该方案在功能层面已经闭环，但与 ARCHITECTURE §4.1.2 定义的**目标形态**存在三处差距：

1. **同步阻塞 HTTP 响应**：Gateway `ingest()` 在返回 200 前等待 `saveBatch` 写库 + UPSERT issues + HLL pfadd 全部完成，单批次 P95 耗时与 DB / Redis 抖动强耦合；压测（T1.3.6）显示 100 并发下 P95 可达 350ms，接近 SDK 默认 5s 上报超时的 7%。
2. **Sourcemap 还原缺席**：当前 raw 表里 `stack` / `frames` 写入的是 SDK 端 `stack-parser.ts` 解析出的**压缩后帧**；ADR-0005 / §4.1.2 要求服务端用 source-map v0.7 还原为源码坐标。压缩帧直接落库导致 Issue 指纹（`top-frame.file + function`）在 release 变更时发生漂移 —— 同一 Bug 每次发版换一个 Issue 新增。
3. **`events_raw` 分区即将耗尽**：ADR-0017 §3.8 初始建 4 张周分区覆盖 `2026-04-20 ~ 2026-05-18`，现已进入第三张（`events_raw_2026w19`），**2026-05-18 之后写入即失败**。ADR-0017 明示「T1.4.1 前落地分区维护 cron」，是本切片不可延期的硬依赖。

此外，ARCHITECTURE §3.4 队列清单里 `events-error` 至今为 🟡 过渡态。本 ADR 以**最小代码面 + 最大可回滚性**改造 Gateway 异步化，将 `events-error` 推进到 🟢 已落地，并为 `events-performance` / `events-api` 等同构队列的后续接管提供样板。

## 决策

采用**方案 A（推荐）：ErrorProcessor 接管 + SourcemapService stub 可选注入 + 独立分区维护 cron**，分三条独立路径推进但在同一切片交付，共用 ADR-0026 编号。

### 1. 异步化：Gateway 改为 enqueue，ErrorProcessor 消费

```
SDK ──batch──▶ Gateway
      · Zod 校验 · DSN → projectId · Redis SETNX 幂等
      · Queue.add('events-error', { events: first.filter(isError), projectId }, { attempts: 3, backoff: exp, removeOnComplete: 1000 })
      · HTTP 返回 { accepted, enqueued: errorEvents.length, duplicates }
      └─ 同步直调仅保留在 BullMQ 不可用时的降级路径（环境开关 ERROR_PROCESSOR_MODE=sync|queue，默认 queue）

BullMQ: events-error ──▶ ErrorProcessor
      · 拉 batch（concurrency=4, per-worker batchSize = 100）
      · 为每条 event 调用 SourcemapService.resolveFrames(event) 还原
      · 调 ErrorsService.saveBatch(resolved) 不变（幂等、HLL、DLQ 已齐备）
      · 失败 → BullMQ 自带重试 3 次指数退避 → @OnQueueFailed 转投 events-error-dlq
```

**关键细节**：

- `Queue` / `Worker` 通过 `@nestjs/bullmq` 注册（新增依赖，~3 KB）；Redis 连接复用 `RedisService`
- `GatewayService.ingest` 返回 payload **加字段不删字段**：新增 `enqueued` 数字，`persisted` 保留为 0（表示"同步落库数"）以维持 SDK 端契约向前兼容
- `ERROR_PROCESSOR_MODE` env 开关：`queue`（默认）/ `sync`（回滚到 T1.4.1 切片行为）/ `dual`（同时入队 + 同步直调，**仅用于灰度期 T1.4.1+N 天内对比**），降低回滚窗口
- Processor 与 Gateway 在同一进程（符合 ADR-0001 模块化单体），通过 `BullModule.registerQueue({ name: QueueName.EventsError })` 注入

### 2. Sourcemap：SourcemapService 骨架 + stub pass-through

本切片**不触 T1.5.1~T1.5.3**（S3/MinIO 存储 + multipart upload + source-map v0.7 还原），仅建接口与空实现：

```typescript
// apps/server/src/modules/sourcemap/sourcemap.service.ts
@Injectable()
export class SourcemapService {
  /**
   * 还原事件堆栈帧（T1.5.3 完整实现）
   * 本切片 stub：直接返回原 frames，记 debug 日志便于后续观测
   * 注入点：ErrorProcessor 循环内 await resolveFrames(event)
   */
  async resolveFrames(event: ErrorEvent): Promise<ErrorEvent> {
    return event; // no-op；T1.5.3 替换为 LRU + s3 + source-map.consumer 链路
  }
}
```

**优势**：Processor 代码一次写好，T1.5.3 落地后**无需再改 Processor**；SourcemapModule 独立迭代不会拖住本切片。

### 3. 分区维护 cron：ScheduleModule + `@Cron` 每周一预创建下两周分区

- 新增依赖 `@nestjs/schedule@^4`（已是 NestJS 生态官方包）
- 新增 `PartitionMaintenanceService`：每周一 03:00 UTC 扫描 `events_raw` 已有分区，预建未来 2 周（保持 N+2 水位）
- 同步补齐 5 张新分区的幂等 DDL：`2026w21 ~ 2026w25`（2026-05-18 ~ 2026-06-22），写入 `ddl.ts` `EVENTS_RAW_DDL`，当期重启即补齐
- cron 失败不抛异常，仅 WARN 日志；真正的运维告警通过 `events-error-dlq` 在 M4 告警引擎接入后统一兜底

**范围边界**：本 cron **仅负责 `events_raw` 通用父表**（ADR-0017 §3.8 的设计保留目标，虽当前各业务域写的是独立 raw 表），不扩展到 `error_events_raw` / `perf_events_raw` 等非分区表。

### 4. 任务 ID 策略（回应 Phase 1 疑问 1）

不追溯改 T1.4.1 / T1.4.2 的 `[x]` 状态（它们确为切片方案闭环），新增任务组：

- **TM.E.1 ~ TM.E.N**（E = ErrorProcessor Enhancement）承载本切片所有任务
- 在 CURRENT.md 里追加至 M1.4 节末尾，标注"承接 T1.4.1 切片方案 → ADR-0026 目标形态"
- T1.5.4 "ErrorProcessor 接入还原 Service" 保持 `[ ]`，由 T1.5.3 落地后另起 PR 替换 `SourcemapService.resolveFrames` 实现体

## 备选方案

### 方案 A（推荐，已采纳）：ErrorProcessor 接管 + Sourcemap stub + 独立分区 cron

**优点**：
- 最小代码面（ErrorsService / IssuesService / HLL / DLQ 零改动，直接复用）
- 三条路径（异步化 / Sourcemap / 分区）耦合度低，任意一条延期不阻塞其他两条
- `ERROR_PROCESSOR_MODE=sync|queue|dual` 灰度开关提供 30 秒级回滚能力
- 为后续 `events-performance` / `events-api` 改造提供可复用样板

**缺点**：
- Gateway 响应语义从"已持久化"转为"已入队"：`persisted=N` 字段语义退化。通过新增 `enqueued` 字段 + SDK 本期不消费任一字段 来缓解
- Sourcemap stub 上线期间 Issue 指纹仍基于压缩帧 —— 与当前切片方案零差异，不引入新问题
- Processor 与 Gateway 同进程：单实例 Worker 能力受限于 Node.js CPU。MVP 单实例压测足以支撑目标 5000 events/s，后续多实例水平扩展由 BullMQ 天然支持

### 方案 B：合并交付 T1.5.1 ~ T1.5.3（Sourcemap 完整闭环）

**做法**：本切片同时交付 Release 创建 API + MinIO 存储 + multipart upload + source-map v0.7 还原 + LRU 缓存。

**优点**：Issue 指纹直接稳定为源码坐标，避免过渡期漂移

**缺点**：
- 工期 3d → ~10d（Sourcemap 链路涉及 cli 上传 + vite-plugin + S3 SDK，串行链过长）
- 与 T1.2.x SDK 核心 / T1.5.5 cli / T1.5.6 vite-plugin 存在外部依赖（SDK breadcrumbs / release 元数据），阻塞风险高
- 本切片变更面 ~40 文件 vs 方案 A 的 ~15 文件，评审与回滚成本翻倍

### 方案 C：保持同步直调，仅加 Sourcemap + 分区 cron

**做法**：不动 Gateway，但在 `ErrorsService.saveBatch` 里调 SourcemapService；分区 cron 独立加。

**优点**：无 BullMQ 改造，零并发风险

**缺点**：
- 没有解决同步阻塞 HTTP 响应的根因，P95 只会随 SourcemapService 的 S3 IO 进一步恶化
- ARCHITECTURE §4.1.2 目标形态仍未落地，`events-error` 状态维持 🟡，后续每个业务域都得再来一次相同的讨论
- 技术负债累积，不符合 ADR-0002（BullMQ 是 MVP 的 Queue 选型基线）

## 影响

### 收益

- **HTTP 响应 P95 解耦**：Gateway `ingest` 从"等 DB + Redis + Sourcemap"退化为"等 Redis enqueue"，P95 预估下降 60%~80%（150ms → 30ms）
- **系统可观测性**：`events-error` 队列长度 / 处理速率 / DLQ 入队数变成第一梯队的运维指标，有明确的健康红线
- **可扩展性铺路**：同构模式复用到 events-performance/api/resource/custom/log/track/visit 共 7 条 🟡 队列，后续每条改造工作量 ≤ 1d
- **分区维护自动化**：彻底消除 ADR-0017 分区耗尽的运维地雷

### 成本

- **新增依赖**：`@nestjs/bullmq@^10` + `bullmq@^5` + `@nestjs/schedule@^4`（bullmq 占后端包体约 +800 KB，无 SDK 影响）
- **代码量**：~15 文件新增/修改，~600 LOC
- **灰度期**：建议 2 天 `ERROR_PROCESSOR_MODE=dual` 双写模式比对 Issue 聚合一致性；之后切 `queue`

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| BullMQ Worker 单实例性能不足 | 初期 `concurrency=4`，压测后调优；未来多实例水平扩展由 BullMQ 原生支持 |
| Redis 故障导致入队失败 | Queue.add 失败时自动降级到 `ERROR_PROCESSOR_MODE=sync` 路径（进程内 fallback）；Redis 恢复后自动切回 |
| dual 模式双写导致 issues.event_count 翻倍 | UPSERT 天然幂等由 `event_id UNIQUE` 在 raw 层兜底；issues UPSERT 受 raw 层 `ON CONFLICT DO NOTHING` 保护，双写不产生重复聚合 |
| 分区 cron 漏执行 | 启动时立即触发一次 tick；cron 采用 `@Cron` 声明式；失败 WARN 日志 + DLQ 告警 |
| HTTP 响应字段变更影响 SDK | 仅**新增** `enqueued` 字段，`accepted` / `persisted` / `duplicates` 全部保留；SDK 当前忽略未知字段 |

### 零行为变更承诺（对 SDK / Web 契约）

- HTTP 路由 `/ingest/v1/events` **不变**
- 请求 Schema（`IngestRequestSchema`）**不变**
- 响应 Schema **仅增不改**：追加 `enqueued: number`；`accepted` / `persisted` / `duplicates` 语义保留
- `error_events_raw` / `issues` 表结构 **不变**
- DashboardModule `/dashboard/v1/errors/overview` **不变**

### 非目标（明确不在本切片）

- T1.5.1 ~ T1.5.3 Sourcemap 真实还原（仅 stub）
- T1.5.5 `@g-heal-claw/cli` 上传工具
- T1.5.6 `@g-heal-claw/vite-plugin`
- events-performance / events-api 等 🟡 队列改造（下阶段参照本 ADR 复刻）
- `events_raw` 父表在各业务域的通用写入（各业务仍写独立 raw 表）

## 后续

### Demo / 使用文档

- **Demo 场景**：复用 `examples/nextjs-demo/app/errors/*` 已有 7 个异常触发按钮；不新增页面，但 demo 页注释追加"事件现在走 BullMQ 异步消费，Server 日志观察 `[ErrorProcessor]` 前缀即可"
- **apps/docs 使用说明**：
  - `apps/docs/docs/reference/error-processor.mdx`（新建）：介绍 `events-error` 队列 / `ERROR_PROCESSOR_MODE` 开关 / DLQ 行为 / Sourcemap stub 语义
  - `apps/docs/docs/guide/ops/partition-maintenance.mdx`（新建）：分区 cron 执行策略 + 手动补建命令

### 项目文档传导

- `docs/ARCHITECTURE.md §3.4`：`events-error` 由 🟡 → 🟢；备注 ADR-0026
- `docs/ARCHITECTURE.md §4.1.2`：将"目标实现"改为"当前实现"；注明 Sourcemap 为 stub、待 T1.5.3 完整化
- `docs/SPEC.md`：Ingest 响应 Schema 追加 `enqueued` 字段
- `docs/decisions/README.md`：索引新增 ADR-0026 行
- `docs/tasks/CURRENT.md`：M1.4 节末尾追加 TM.E.1~TM.E.N；"当前焦点"指向 TM.E.1
- `.env.example`：新增 `ERROR_PROCESSOR_MODE` / `PARTITION_MAINTENANCE_CRON` 两个键

### 任务拆解预告（Phase 3 将细化）

| ID | 标题 | 工时 | 依赖 |
|---|---|---|---|
| TM.E.1 | BullMQ 依赖 + `EventsErrorQueue` / `ErrorProcessor` 骨架 | 0.6d | 无 |
| TM.E.2 | Gateway `errors` 分流改为 enqueue（含 `ERROR_PROCESSOR_MODE` 开关 + `enqueued` 字段） | 0.8d | TM.E.1 |
| TM.E.3 | `SourcemapModule` 骨架 + `SourcemapService.resolveFrames` stub + Processor 注入点 | 0.4d | TM.E.1 |
| TM.E.4 | ErrorProcessor 消费循环 + `@OnQueueFailed` → DLQ 桥接 | 0.6d | TM.E.3 |
| TM.E.5 | `@nestjs/schedule` + `PartitionMaintenanceService`（预建 N+2 水位）+ `ddl.ts` 扩 5 张分区 | 0.8d | 无 |
| TM.E.6 | 单测 & e2e：Gateway enqueue / Processor 消费链路 / 分区 cron tick | 0.8d | TM.E.2,TM.E.4,TM.E.5 |
| TM.E.7 | 文档传导（ARCHITECTURE / SPEC / CURRENT / .env.example / apps/docs / demo 注释） | 0.4d | TM.E.6 |

**预估总工时**：4.4d（含测试与文档）

## 实际落地摘要（2026-04-30）

7 个子任务全部 `[x]`（TM.E.1 ~ TM.E.7）；server typecheck PASS / 260 unit + 6 e2e PASS。

**关键改动清单**：

- SDK → 无改动
- server：
  - 新增：`src/shared/queue/queue.module.ts`（全局 BullMQ 连接）、`src/modules/sourcemap/*`（Service stub + Module）、`src/modules/errors/error.processor.ts`（@Processor(events-error) + onFailed→DLQ）、`src/modules/partitions/*`（@Cron(0 3 * * 1) + ISO 周工具 + 启动即 tick）
  - 修改：`src/gateway/gateway.module.ts` 注册 events-error Producer；`src/gateway/gateway.service.ts` 按 MODE 分流（queue / sync / dual）+ Redis 失败降级路径；`src/modules/errors/errors.module.ts` 注册 events-error Consumer + 导入 SourcemapModule + 挂载 ErrorProcessor；`src/app.module.ts` 注册 ScheduleModule.forRoot() + PartitionsModule；`src/shared/database/ddl.ts` 新增 5 张周分区（2026w21 ~ 2026w25，覆盖 2026-05-18 ~ 2026-06-22）
- shared：`env/server.ts` 新增 5 键 `ERROR_PROCESSOR_MODE` / `ERROR_PROCESSOR_CONCURRENCY` / `ERROR_PROCESSOR_ATTEMPTS` / `ERROR_PROCESSOR_BACKOFF_MS` / `PARTITION_MAINTENANCE_CRON`
- 测试：`tests/gateway/gateway.service.spec.ts`（4 case MODE 分流）、`tests/modules/errors/error.processor.spec.ts`（5 case 成功/失败/DLQ 终态）、`tests/modules/sourcemap/sourcemap.service.spec.ts`（3 case 契约）、`tests/modules/partitions/partition-maintenance.service.spec.ts`（7 case ISO 周工具）、`tests/gateway.e2e-spec.ts` 扩展响应字段

**灰度节奏建议**：`ERROR_PROCESSOR_MODE` 默认已切至 `queue`；若生产需双写比对，运维改 `dual` 持续 1~2 天后再回到 `queue`。Redis 故障时进程自动降级 sync 且记 WARN 日志。

**Sourcemap 还原状态**：本期为 stub（原样返回），T1.5.3 完整还原落地时仅替换 `SourcemapService.resolveFrames` 实现体，ErrorProcessor 无需改动。
