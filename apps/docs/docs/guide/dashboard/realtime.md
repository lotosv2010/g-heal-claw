# 实时监控

路径：Dashboard → **实时监控** `/dashboard/realtime`

> 状态：已交付（ADR-0030 · TM.2.C）

## 能力简介

平台运营视角的实时大盘：打开页面即看"最近 60 秒系统在发生什么"。

- **SSE 推送**：`GET /api/v1/stream/realtime` 单向流，Redis Pub/Sub + Streams（MAXLEN 1000）组合支持 `Last-Event-ID` 断线回放
- **3 个 topic**：`error` · `api` · `perf`（仅 LCP/INP/CLS 三个核心 Web Vitals）
- **客户端缓存**：最近 500 条 FIFO；按 10s 滚动窗口本地计算 QPS
- **控件**：topic 过滤（至少保留 1 个）/ 暂停接收（不断连）/ 清空列表
- **状态徽标**：EventSource.readyState 映射三态（OPEN=live / CONNECTING=empty / ERROR=error）

## 协议与 Payload

SSE 帧示例：

```
event: error
id: 1730000000000-0
data: {"topic":"error","ts":1730000000000,"subType":"js","messageHead":"TypeError: Cannot read ...","url":"https://x.test/a"}

event: api
id: 1730000000123-0
data: {"topic":"api","ts":1730000000123,"method":"POST","pathTemplate":"/order","status":500,"durationMs":820}

: heartbeat 1730000000456
```

| 字段 | 约束 |
|---|---|
| `event` | topic 名称（`error` / `api` / `perf`） |
| `id` | Redis Streams entry id；断线重连时浏览器自动带 `Last-Event-ID` |
| `data` | JSON 单条；单条 ≤ 256 字节（大盘展示子集，非完整事件） |
| 心跳 | 每 15s 一条 `: heartbeat <ts>` 空注释行，穿透代理 |

## 查询参数

`GET /api/v1/stream/realtime`

| 参数 | 必填 | 说明 |
|---|---|---|
| `projectId` | ✓ | 对应 `NEXT_PUBLIC_DEFAULT_PROJECT_ID` |
| `topics` | × | 逗号分隔 `error,api,perf`；缺省订阅全部 |
| `lastEventId` | × | 断线重连时可手动指定；浏览器 EventSource 自动通过 `Last-Event-ID` 头发送 |

## 配置项

| 变量 | 默认 | 作用 |
|---|---|---|
| `REALTIME_SAMPLE_RATE` | `1` | Gateway 入库后 publish 概率；0 关闭实时 |
| `REALTIME_STREAM_MAXLEN` | `1000` | 每 project × stream 最大条数，控制 Redis 内存 |
| `REALTIME_MAX_CONN_PER_PROJECT` | `10` | 单 projectId SSE 并发上限，超出直接 429 |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | EventSource 基地址 |

## 常见问题

- **连接后没有事件？** 先运行 `pnpm dev:demo` 并进入 `/dashboard/realtime` 触发 error/api/perf 样本；也可在正式环境通过 SDK 接入流量验证。
- **长时间挂起后断连？** SSE 正常行为；前端封装会指数退避重连（1s → 30s，最多 5 次）。超出重试上限后会显示"SSE 断开"徽标。
- **为什么某些 perf 指标（FCP/TTFB）看不到？** 实时大盘仅推送 LCP/INP/CLS 三个核心 Web Vitals 以控制 payload 体积；其他指标进入离线聚合。
- **多实例部署怎么路由？** Redis Pub/Sub 广播到所有订阅实例，SSE 连接不需要 sticky session，天然分布式友好。

## Demo 场景

`examples/nextjs-demo/app/(demo)/dashboard/realtime/page.tsx`：`pnpm dev:demo` 打开 `http://localhost:3100/dashboard/realtime`，点击"一键全部"后回 `http://localhost:3000/dashboard/realtime` 观察大盘滚动。

## 决策记录

- [ADR-0030](../../../../../docs/decisions/0030-dashboard-realtime-slice.md)：Redis Pub/Sub + SSE + 3 topics · 平台观察者视角（非用户应用 WS 观测）
- [ADR-0007](../../../../../docs/decisions/README.md)：实时推送走 Redis Pub/Sub + SSE（被本切片复用）
