# ADR-0007: 实时推送走 Redis Pub/Sub + SSE（非 WebSocket）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

实时监控大盘需要将最新事件即时推送到前端（秒级延迟），用于 live feed 和 QPS 曲线。需要选择推送协议和后端分发机制。

约束条件：
- 推送方向单向（server → client）
- 每个项目最多 10 个并发观察者
- 前端 Next.js SSR，首屏不依赖长连接
- 期望利用浏览器原生自动重连能力
- Fastify adapter 对 WebSocket 需额外插件

## 决策

采用 **Redis Pub/Sub + Streams** 作为后端分发 + **SSE（Server-Sent Events）** 作为客户端推送协议：

1. **Redis Pub/Sub** — Gateway 入库后 fire-and-forget `PUBLISH` 到 topic channel；RealtimeService 持有独立订阅连接 `PSUBSCRIBE rt:<pid>:*`
2. **Redis Streams** — `XADD MAXLEN ~1000` 保留 60s 回放能力；新连接可通过 `Last-Event-ID` 头断点续传
3. **SSE** — 浏览器原生 `EventSource` API；自动重连（exponential backoff）；无需 WebSocket 握手/心跳状态管理
4. 端点：`GET /api/v1/stream/realtime?projectId=xxx&topics=error,api,perf`
5. 每 projectId 限 10 条并发 SSE 连接，超限返回 429

## 备选方案

| 方案 | 评估 |
|---|---|
| **WebSocket** | 双向能力多余（实时大盘是单向推送）；需维护连接心跳/重连逻辑；Fastify 需 `@fastify/websocket` 额外插件 |
| **Long Polling** | 延迟高（每次 poll 一个 RTT）；服务端连接资源浪费 |
| **gRPC Streaming** | 浏览器不原生支持；需 gRPC-Web 代理层 |
| **直接轮询 REST API** | 前端 1s 间隔轮询；N 客户端 × M 请求/s = 后端压力线性增长 |

## 影响

- **收益**：浏览器原生 API（零依赖）；自动重连；HTTP/2 下复用连接；断点续传
- **成本**：SSE 不支持二进制数据（JSON 文本即可）；单向通信（本场景不需要双向）
- **缓解**：15s 心跳保活避免代理超时断连

## 后续

- 实现见 ADR-0030（RealtimeModule 完整切片）
- 用户应用 WS/SSE 连接观测（采集用户应用的 WebSocket 状态）留独立切片
