# ADR-0006: 告警引擎采用 Pull 式定时评估

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

告警引擎需要在指标达到阈值时触发通知。有两种评估模型：
- **Push 式**：每条事件入库时实时判定是否触发规则（事件驱动）
- **Pull 式**：定时轮询聚合指标，与规则阈值比较（cron 驱动）

约束条件：
- 告警规则涉及时间窗口聚合（如"5 分钟内错误率 > 5%"）
- 实时性要求不高（1 分钟延迟可接受）
- 需要 cooldown 机制避免重复告警
- 规则数量预期 < 1000（单项目 6 条预置 × N 个项目）

## 决策

采用 **Pull 式定时评估**（`@Cron('*/1 * * * *')` 每分钟）：

1. `AlertEvaluatorService` 每分钟拉取所有 enabled 规则
2. 对每条规则，按 `target`（error_rate / lcp_p75 / api_error_rate / ...）查询对应域 Service 聚合
3. 与阈值比较，结合 `cooldownMinutes` 判定是否 firing
4. firing → 写 `alert_history` + 投递 `notifications` 队列
5. 指标恢复 → 自动标记 resolved

## 备选方案

| 方案 | 评估 |
|---|---|
| **Push 式（事件驱动）** | 每条事件都需判定所有规则，高吞吐下 CPU 开销大；时间窗口聚合需维护滑动窗口状态；实现复杂 |
| **Stream Processing（Flink/ksqlDB）** | 实时性最强，但引入重量级基础设施；团队无 Flink 运维经验 |
| **Prometheus + Alertmanager** | 成熟方案，但需额外暴露 /metrics + 维护 PromQL 规则文件；与业务数据隔离 |

## 影响

- **收益**：实现简单；DB 聚合查询即可满足；cooldown/状态机逻辑清晰
- **成本**：最大 1 分钟延迟；规则数过多时单次评估耗时增加
- **缓解**：规则按 projectId 分批；聚合查询走索引；超时跳过 + 下轮重试

## 后续

- 实现见 ADR-0035（AlertModule + NotificationModule）
- 5 种 target 查询抽象见 `alert-evaluator.service.ts`
