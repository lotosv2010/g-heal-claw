# 异常演示场景（ADR-0016 / ADR-0019 / ADR-0026）

> 11 个独立场景覆盖 `ErrorEventSchema.category` 9 分类 + 白屏心跳 + 兼容旧 subType；触发后事件走完整 BullMQ 异步链路。

## 链路观察（ADR-0026）

自 ADR-0026 起，Gateway 收到 `type=error` 事件后 **不再同步落库**，而是入 BullMQ 队列 `events-error`，由 `ErrorProcessor` 异步消费并完成 Sourcemap 还原 + 指纹聚合 + Issue UPSERT。

**一次完整触发的 Server 日志示例：**

```
[GatewayService] POST /ingest/v1/events → { accepted: 1, persisted: 0, duplicates: 0, enqueued: 1 }
[ErrorProcessor] batch=1 persisted=1 duration=12ms
```

- `enqueued` > 0：Gateway 入队成功
- `[ErrorProcessor]` 前缀：Worker 已消费并落库
- 若 Redis 故障：HTTP 响应 `enqueued=0`（自动降级 sync，`persisted>0`），`WARN` 日志含 `queue degraded → sync fallback`

## Dashboard 验证

- 触发任一按钮后，打开 `http://localhost:3000/monitor/errors`
- 9 分类卡片（ajax / api_code / js / promise / resource / js_load / image_load / css_load / media_load）数值实时上涨
- 堆栈详情当前为压缩帧（T1.5.3 完成后自动还原为源码坐标，无需再触发）

## 相关文档

- [Rspress · ErrorProcessor](../../../../apps/docs/docs/reference/error-processor.md)
- [ADR-0026 · BullMQ 接管](../../../../docs/decisions/0026-error-processor-bullmq-takeover.md)
