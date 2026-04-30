# ErrorProcessor（异常事件异步消费）

> 自 ADR-0026 起，Gateway 收到 `type=error` 事件后不再同步落库，而是入 BullMQ 队列 `events-error`，由 `ErrorProcessor` 异步消费并完成 Sourcemap 还原 + 指纹聚合 + Issue UPSERT。

## 响应契约

`POST /ingest/v1/events` 响应在原有字段基础上新增 `enqueued`：

```json
{
  "accepted": 3,      // 通过 DSN + Zod 校验的事件数
  "persisted": 1,     // 同步落库的事件数（perf / track / visit / api / resource / custom 等）
  "duplicates": 0,    // 被 Redis SETNX 幂等拦截的事件数
  "enqueued": 2       // 入 events-error 队列的 error 事件数
}
```

SDK 忽略未知字段；字段仅**增加**不**删除**，向前兼容。

## 运行模式：`ERROR_PROCESSOR_MODE`

| 模式 | 行为 | 使用场景 |
|---|---|---|
| `queue`（默认） | Gateway 仅入队；Processor 消费时落库 + 聚合 | 生产稳态 |
| `sync` | Gateway 同步直调 `ErrorsService.saveBatch`（回滚到 ADR-0016 切片行为） | Redis 故障或需紧急回滚时 |
| `dual` | Gateway 同时入队 + 同步直调 | 灰度切换期双写比对（1~2 天后切回 `queue`） |

**自动降级**：`MODE=queue` 时若 `Queue.add` 失败（Redis 不可用），单次请求自动降级 sync 并记 `WARN` 日志；后续请求会持续走 sync 直到进程重启。

## 重试与 DLQ

| 参数 | 默认值 | Env 键 |
|---|---|---|
| 并发 | 4 | `ERROR_PROCESSOR_CONCURRENCY` |
| 最大尝试次数 | 3 | `ERROR_PROCESSOR_ATTEMPTS` |
| 退避基数（ms） | 2000（指数退避） | `ERROR_PROCESSOR_BACKOFF_MS` |

- 重试 3 次仍失败 → `@OnWorkerEvent('failed')` 桥接到 `events_dlq` 表（reason=`processor-exhausted: ...`）
- DLQ 条目可通过 Dashboard / `psql` 手工检视，M4 告警引擎接入后统一兜底

## Sourcemap 还原

本期为 **stub**（`SourcemapService.resolveFrames(events) => events`，原样返回）。T1.5.3 落地完整 source-map v0.7 还原后，仅替换 `resolveFrames` 实现体，Processor 无需改动。

## 本地观测

- 启动日志：`[ErrorProcessor] listening queue=events-error concurrency=4`
- 每批处理日志：`[ErrorProcessor] batch=N persisted=M duration=Xms`
- Demo 验证：`examples/nextjs-demo/app/errors/*` 触发任一异常按钮，Server 终端观察 `[ErrorProcessor]` 前缀

## 相关 ADR

- [ADR-0016](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0016-error-monitoring-slice.md)：异常监控闭环切片（同步直调版）
- [ADR-0026](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0026-error-processor-bullmq-takeover.md)：BullMQ 接管（本页对应）
