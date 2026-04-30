# 自定义上报

`customPlugin` 提供三个主动业务 API，与被动 DOM 采集的 `trackPlugin` 在 `type` 维度完全独立：

| API | 事件类型 | 用途 | 大盘 |
|---|---|---|---|
| `GHealClaw.track(name, properties?)` | `custom_event` | 业务埋点（加购、下单、分享） | 埋点分析 → 自定义上报（事件 Top） |
| `GHealClaw.time(name, durationMs, properties?)` | `custom_metric` | 业务测速（结算耗时、编辑器冷启动、内部 API） | 埋点分析 → 自定义上报（p50/p75/p95 + avg） |
| `GHealClaw.log(level, message, data?)` | `custom_log` | 分级日志（info / warn / error）主动上报 | 监控中心 → 自定义日志 |

> 源于 [ADR-0023](https://github.com/lotosv2010/g-heal-claw/blob/main/docs/decisions/0023-custom-and-logs-slice.md)。customPlugin 无任何 DOM 监听，三个 API 产出的 `type` 与 `trackPlugin`（`type='track'`）完全不重叠。

## 启用插件

```ts
import { init, customPlugin } from "@g-heal-claw/sdk";

init(
  { dsn: "https://<publicKey>@<host>/<projectId>" },
  {
    plugins: [
      customPlugin({
        // 默认 true；禁用后 track / time / log 全部 no-op
        enabled: true,
        // 单会话 custom_log 上限（默认 200，防日志风暴）
        maxLogsPerSession: 200,
        // log.data JSON 字节上限（默认 8192，超出截断并追加 __truncated: true）
        maxLogDataBytes: 8192,
      }),
    ],
  },
);
```

## 主动业务埋点（track）

```ts
GHealClaw.track("cart_add", { sku: "SKU-A", price: 99.9, qty: 1 });
GHealClaw.track("checkout_success", { amount: 299, currency: "CNY" });
GHealClaw.track("share_click", { channel: "wechat" });
```

**静默丢弃场景**：
- SDK 未 `init` / `customPlugin` 被禁用
- `name` 为空字符串或仅空白

## 主动业务测速（time）

```ts
const t0 = performance.now();
await doCheckout();
GHealClaw.time("checkout_duration", Math.round(performance.now() - t0), {
  step: "pay",
});
```

**静默丢弃场景**：
- `durationMs` 非有限数（NaN / Infinity）
- `durationMs < 0`
- `durationMs > 86_400_000`（24 小时，视为误用）

**大盘聚合**：后端对每个 `name` 独立计算 p50 / p75 / p95 / avg（`percentile_cont WITHIN GROUP`），覆盖 24 小时窗口。

## 分级日志（log）

```ts
GHealClaw.log("info", "user clicked share", { channel: "wechat" });
GHealClaw.log("warn", "payment retry", { orderId, attempt: 2 });
GHealClaw.log("error", "upload failed", { code: "E_TIMEOUT", file: "a.png" });
```

**防日志风暴三层约束**：
1. **单会话上限**：默认 200 条，达到后静默丢弃
2. **data 字节上限**：默认 8192 字节，超出自动截断：
   ```json
   {
     "__truncated": true,
     "__originalBytes": 16384,
     "__preview": "前 8192 字节的原始 JSON..."
   }
   ```
3. **循环引用兜底**：无法 `JSON.stringify` 时降级为 `{ __truncated: true, __reason: "serialize_failed" }`

## 与 trackPlugin 的区别

`trackPlugin`（被动 DOM 埋点）与 `customPlugin`（主动业务 API）在 `type` 维度完全独立：

| 插件 | 触发方式 | 事件 type | 大盘 |
|---|---|---|---|
| `trackPlugin` | 监听 `[data-track]` 点击 / `[data-track-expose]` 曝光 / form submit | `track`（subType: click / expose / submit / code） | 埋点分析 → 事件分析 |
| `customPlugin` | 主动 API（`track` / `time` / `log`） | `custom_event` / `custom_metric` / `custom_log` | 埋点分析 → 自定义上报 / 监控中心 → 自定义日志 |

> 旧版 `trackPlugin.track(name, props)`（产出 `type='track', subType='code'`）保留用于兼容旧代码埋点；新业务**优先使用** `customPlugin.track`。

## 数据流

```
customPlugin.track  ──▶ /ingest/v1/events (type='custom_event')  ──▶ custom_events_raw  ──▶ /dashboard/v1/custom/overview  ──▶ /tracking/custom
customPlugin.time   ──▶ /ingest/v1/events (type='custom_metric') ──▶ custom_metrics_raw ──▶ /dashboard/v1/custom/overview  ──▶ /tracking/custom
customPlugin.log    ──▶ /ingest/v1/events (type='custom_log')    ──▶ custom_logs_raw    ──▶ /dashboard/v1/logs/overview    ──▶ /monitor/logs
```

## 本地联调

1. `docker compose up -d && pnpm dev`
2. 访问 demo `http://localhost:3002`，打开「自定义上报」分组：
   - `/custom/track` 触发 `custom_event`
   - `/custom/time` 触发 `custom_metric`
   - `/custom/log` 触发 `custom_log`（含大 payload 截断演示）
3. 打开 DevTools → Network 观察 `POST /ingest/v1/events` 载荷
4. 访问 `http://localhost:3000/tracking/custom` 与 `/monitor/logs` 查看聚合大盘
