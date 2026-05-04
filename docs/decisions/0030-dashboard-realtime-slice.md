# ADR-0030: 实时监控切片（TM.2.C · Redis Pub/Sub + SSE 平台实时大盘）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |

## 背景

ADR-0020 Tier 2.C 将 `realtime` 标注为"5d · 前置需新 ADR 定协议范围与采集边界"。当前 `(console)/dashboard/realtime/page.tsx` 是 `PlaceholderPage`。

存在两条截然不同的产品形态歧义（需显式决断）：

- **A. 平台面向运营的实时大盘**：运营打开页面看"最近 60s 内系统在发生什么"（错误涌现、API 错误率飙升、LCP 异常），数据来自**已有事件流**，通过 Redis Pub/Sub + SSE 实时推送
- **B. 用户应用 WebSocket/SSE 通信观测**：在用户应用里 hook `WebSocket` / `EventSource` 构造器，上报连接生命周期 + 消息延迟，用户看"我的应用对外 WS/SSE 连接健康度"

两者共享名称"实时监控"但本质完全不同：A 是**观察者视角**（我们看系统），B 是**被观察者视角**（系统观察自身 WS 流量）。

约束：
- ADR-0007 已定"实时推送走 Redis Pub/Sub + SSE（非 WebSocket）"
- ARCHITECTURE §4.3 已规划 `RealtimeModule` 订阅 Redis → SSE `/api/v1/stream/{overview,issues,heal/:jobId}`，但零代码
- 无 RBAC，沿用 `NEXT_PUBLIC_DEFAULT_PROJECT_ID`
- 不新增 BullMQ 队列（ADR-0026 原则：仅 errors 先走队列）

## 决策

### 1. 范围边界：选 A（平台实时大盘）

本切片**仅实现平台面向运营的实时大盘**，B 方案（用户应用 WS/SSE 观测）**留作独立切片**，不在本 ADR 范围内。

理由：
- A 与 ADR-0007 / ARCHITECTURE §4.3 天然对齐，无新架构决策
- A 复用已有 `error_events_raw` / `perf_events_raw` / `api_events_raw` 数据流，零 SDK 变更、零新表
- B 需要独立 SDK 插件 + raw 表 + 聚合 API，工期 5d+ 且是"通信层 APM"独立产品线，与本菜单主题不吻合
- 用户当次明确回复"推荐"（Q2 A），认同此裁剪

### 2. 推送协议

**SSE + Redis Pub/Sub**（ADR-0007 复用）：

```
HTTP Gateway ingest ──▶ 落 raw 表
                  └──▶ Redis PUBLISH rt:<projectId>:<topic>   (异步、最小 payload)
                                    │
                                    ▼
               RealtimeService SUBSCRIBE rt:<projectId>:*
                                    │
                                    ▼
                 SSE GET /api/v1/stream/realtime?projectId=X
                     (Last-Event-ID 60s replay from Redis Stream)
```

### 3. Topic 清单（首版仅 3 类）

| Topic | Payload 骨架 | 来源 |
|---|---|---|
| `rt:<pid>:error` | `{ ts, subType, category, messageHead, url }` | `GatewayService.ingestError` 入库后 publish |
| `rt:<pid>:api` | `{ ts, method, pathTemplate, status, durationMs }` | `GatewayService.ingestApi` 入库后 publish |
| `rt:<pid>:perf` | `{ ts, metric, value, url }`（仅 LCP/INP/CLS 三个） | `GatewayService.ingestPerformance` 入库后 publish |

- **采样控制**：`REALTIME_SAMPLE_RATE`（默认 `1.0`），Gateway 端先落表 → 按采样决定是否 publish；publish 失败不回滚入库
- **payload 体积**：每条 ≤ 256 字节（只含大盘展示需要字段，不是完整事件）
- **Topic 不在 packages/shared 重复定义**：直接在 `apps/server/src/modules/realtime/topics.ts` 常量化（Web 侧不直接订阅 Redis，只订 SSE）

### 4. SSE 端点

`GET /api/v1/stream/realtime`（挂在 `GatewayController` 所在的 `api/v1` 前缀下，复用公网 ingest 入口路由组的基础设施，非 dashboard 私有）：

```
Query:  projectId=string (必填)
        topics=comma,separated (可选，默认 error,api,perf)
        lastEventId=xxx (SSE 标准，由客户端 EventSource 自动带)

Response (text/event-stream):
event: error
id: 1730000000001
data: {"ts":1730000000000,"subType":"js","messageHead":"TypeError: Cannot...", ...}

event: api
id: 1730000000002
data: {...}

: heartbeat every 15s     (空注释行保活)
```

- **会话模型**：Fastify `reply.raw` 手动写 SSE，无 `@nestjs/common` 内置支持，参考 NestJS + Fastify SSE 标准范式
- **回放窗口**：60s。实现用 **Redis Streams** 作为 publish 载体（`XADD rt:<pid>:stream MAXLEN 1000`），Pub/Sub 作为活跃连接通知——客户端带 `Last-Event-ID` 时从 Stream 回放，否则只接 Pub/Sub 实时流
- **连接限流**：每 projectId 最多 10 条并发 SSE（内存计数，超出直接 429）
- **心跳**：15s 空注释行防止代理切断

### 5. 后台页面结构

`(console)/dashboard/realtime/page.tsx`（client 组件，SSE 必须 client side）：

```
┌─ Stream Header ──────────────────┐
│ ● 连接中 / ○ 已断开 | QPS: 42    │
│ [pause] [clear] topics: ☑err ☑api │
└──────────────────────────────────┘
┌─ Live Feed (virtual list, 500) ──┐
│ 14:32:01 [error] TypeError: x... │
│ 14:32:00 [api]   POST /order 500 │
│ 14:31:59 [perf]  LCP 3100ms      │
│ ...                              │
└──────────────────────────────────┘
┌─ 60s 滚动曲线 ───────────────────┐
│ 三条线：err QPS / api err % / LCP │
└──────────────────────────────────┘
```

- **EventSource** 订阅 `/api/v1/stream/realtime`
- **虚拟列表**保持 500 条历史，超出 FIFO 丢弃
- **60s 滚动曲线**前端每秒 tick 计算 QPS，不依赖服务端预聚合
- 页面顶部 `SourceBadge`：SSE readyState 映射三态（OPEN=live / CONNECTING=empty / ERROR=error）
- **pause**：暂停接收新事件但不断 SSE（仅 UI 侧缓冲抛弃），便于观察某条
- `dayjs` 格式化时间，`@ant-design/plots` Line 作曲线

### 6. 目录落位

- 后端：
  - `apps/server/src/modules/realtime/realtime.module.ts`（新模块）
  - `apps/server/src/modules/realtime/realtime.service.ts`（Redis 订阅 + 内存 subscriber 管理）
  - `apps/server/src/modules/realtime/realtime.controller.ts`（SSE 端点）
  - `apps/server/src/modules/realtime/topics.ts`（topic 常量）
  - `GatewayService.ingest*` 入库后追加 `realtime.publish()` 调用（单向 fire-and-forget）
- 前端：
  - `apps/web/app/(console)/dashboard/realtime/page.tsx`（live 化）
  - `apps/web/lib/api/realtime.ts`（EventSource 封装 + 自动重连）
  - `apps/web/components/realtime/{stream-header,live-feed,realtime-chart}.tsx`

## 备选方案

### A. WebSocket 代替 SSE
- **不选**：与 ADR-0007 冲突；SSE 单向、HTTP/1.1 原生、代理友好，已满足需求

### B. BullMQ 队列 + Worker 拉取
- **不选**：BullMQ 面向持久化任务，实时大盘需要"低延迟 + 无持久化"语义，Pub/Sub + Streams 更合适

### C. 用户应用 WS/SSE 观测（原 B 方案）
- **推迟**：需独立 SDK 插件 + `realtime_events_raw` 表 + 独立 ADR，工期 5d 且是另一个产品形态

### D. 直接 WebSocket 反推到 web（不走 SSE）
- **不选**：与 ADR-0007 冲突；且 Fastify + NestJS 的 WebSocket 需要额外 `@nestjs/platform-ws`，增加依赖

## 影响

### 收益
- 菜单完整化最后一个 Tier 2 项落地
- 为后续"SSE 推送 issue 分诊"、"AI 修复任务进度推送"（ARCHITECTURE §4.3 已规划但未实现）奠定基础设施
- Gateway 写入后 publish 的 side-effect 模式为后续事件驱动扩展点提供样板

### 成本
- 3.5d 工期（后端 realtime module 2d + 前端页面 1d + 测试 + demo + docs 0.5d）
- 新增 `RealtimeModule` 约 350 行（service 管理订阅池 + controller SSE handler + topics 常量 + publish helper）
- 前端 client 页面 + EventSource 封装约 400 行
- Redis 命令数轻微上升（每事件 1 次 `XADD` + `PUBLISH`）；MAXLEN 1000 控制内存
- Gateway ingest 延迟新增 ≤ 2ms（publish 异步、不 await）

### 风险
- **连接泄漏**：SSE 客户端异常断开后服务端需及时释放订阅 → `reply.raw.on('close')` 清理订阅；定期扫描 stale 订阅
- **反压**：某租户 QPS 爆炸时订阅者 payload 堆积 → SSE 写 backpressure 用 `reply.raw.write` 返回值判断 + flush 节流（超过 50 条未 flush 就 drop 旧事件）
- **Redis Streams TTL**：MAXLEN 1000 条约等于 QPS 17 下 60s，QPS 更高时窗口短于 60s → 可接受（运营看的是"最近有什么"，非完整回放）
- **多实例部署**：服务端水平扩容后 Pub/Sub 广播到所有实例，订阅池各自管理 → 天然分布式友好，不需 sticky session

## 后续

- 任务：`TM.2.C.1` ~ `TM.2.C.7`（见 `docs/tasks/CURRENT.md`）
- Demo：`examples/nextjs-demo/app/(demo)/dashboard/realtime/page.tsx`（触发 error/api/perf 三类事件的按钮 + 实时大盘 iframe 嵌入）
- 使用说明：`apps/docs/docs/guide/dashboard/realtime.md`（SSE 协议 + topics 列表 + 后台页用法）
- 反向引用 ARCHITECTURE §4.3：将 `RealtimeModule` 从"规划"切换为"已实现（首版支持 3 topics）"
- 后续增量切片（推迟）：
  - issue 分诊流 `rt:<pid>:issue`（需 Phase 3 ProcessorModule 完成 issue 聚合）
  - AI 修复进度流 `rt:<pid>:heal`（需 Phase 5）
  - 用户应用 WS/SSE 观测（SDK 插件形态，独立切片）
  - health score 推送 topic（依赖 ADR-0029 落地）
  - RBAC / 租户隔离的 SSE 认证（依赖 T1.1.7）
