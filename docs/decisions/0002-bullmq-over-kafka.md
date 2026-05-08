# ADR-0002: MVP 使用 BullMQ 而非 Kafka

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

Gateway 接收 SDK 上报事件后需异步分发给各 Processor（错误聚合、性能预聚合、指纹计算等）。需要一个消息队列实现入口与消费的解耦。

约束条件：
- 已选用 Redis 作为缓存/限流/会话存储（基础设施复用）
- 单日事件量预计 < 1000 万（MVP 阶段）
- 需要延迟重试、死信队列、任务优先级
- 团队对 Kafka 运维经验有限

## 决策

使用 **BullMQ**（基于 Redis Streams）作为 MVP 阶段消息队列：

1. 复用已有 Redis 实例，零额外基础设施成本
2. `@nestjs/bullmq` 与 NestJS 原生集成，`@Processor()` 装饰器开箱即用
3. 内置延迟重试（exponential backoff）、死信队列（DLQ）、并发控制
4. 队列名在 `packages/shared/src/queues/names.ts` 统一定义（12 条 + DLQ 派生）
5. 预留 Kafka 切换口：Processor 通过 DI 注入 Service 消费，底层队列可替换

## 备选方案

| 方案 | 评估 |
|---|---|
| **Apache Kafka** | 吞吐天花板高（百万/s），但运维复杂（ZooKeeper / KRaft）；本地开发需额外容器；团队无运维经验 |
| **RabbitMQ** | 成熟稳定，但 Node.js 生态不如 BullMQ；额外进程依赖 |
| **AWS SQS / GCP Pub/Sub** | 云锁定；本地开发需 mock |
| **同进程内存队列** | 无持久化；进程重启丢消息；不支持多 Worker 扩展 |

## 影响

- **收益**：零额外运维；NestJS 装饰器开发体验好；重试/DLQ/并发开箱即用
- **成本**：Redis 内存受限（MAXLEN 控制）；单 Redis 实例成为瓶颈时需集群或换 Kafka
- **风险**：Redis 宕机丢消息 → 缓解：Gateway 降级同步写入 + DLQ 兜底

## 后续

- 单日事件 > 5000 万或需要 exactly-once 语义时评估迁移 Kafka
- 队列名常量见 `packages/shared/src/queues/names.ts`
- BullMQ 状态见 `docs/ARCHITECTURE.md §3.4`
