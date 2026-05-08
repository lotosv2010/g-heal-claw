# ADR-0004: AI Agent 独立进程部署

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

AI 自愈功能（Issue 诊断 → 生成修复 → 创建 PR）涉及大模型调用、仓库克隆、代码分析等重 CPU/IO 操作。需要决定其运行形态。

约束条件：
- 单次诊断耗时 30s~5min（模型推理 + 仓库文件读取）
- 模型调用成本高，需控制并发
- AI 功能不可用时不应影响主站监控能力
- 可能需要 Docker 沙箱运行用户代码（安全验证）

## 决策

`apps/ai-agent` 作为独立 Node.js 进程部署，通过 BullMQ 队列与 server 通信：

1. **独立进程** — 资源隔离，AI 内存泄漏/OOM 不影响 Gateway/Dashboard
2. **BullMQ 双向队列** — server 投递 `ai-diagnosis` 任务；agent 完成后投递 `ai-heal-fix` 结果
3. **可独立扩缩** — 流量高峰可部署多实例消费；无需求时可零副本
4. **无 NestJS 依赖** — 纯 Node.js + LangChain，启动快、依赖精简
5. **未来可切换为 Docker 容器** — 沙箱验证场景天然适配

## 备选方案

| 方案 | 评估 |
|---|---|
| **NestJS 模块内集成** | AI 长任务阻塞 event loop；OOM 拖垮主站；依赖膨胀 |
| **Serverless Function** | 冷启动 10s+（仓库克隆）；执行时间超 Lambda 限制；有状态（git clone） |
| **独立微服务（gRPC）** | 过度设计；BullMQ 已提供可靠投递和重试 |

## 影响

- **收益**：故障隔离；独立扩缩；进程级资源限制
- **成本**：额外部署单元；本地开发需多 terminal
- **缓解**：`pnpm dev` turbo 并行启动所有 apps

## 后续

- Agent 实现见 ADR-0036
- 通信队列定义见 `packages/shared/src/queues/heal-job.ts`
- Docker 沙箱验证留作后续迭代
