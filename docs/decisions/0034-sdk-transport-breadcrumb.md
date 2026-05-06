# ADR-0034: SDK 传输层升级 + Breadcrumb 自动采集（T1.2.3~T1.2.6）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-06 |
| 决策人 | @Robin |

## 背景

当前 SDK Transport 为骨架占位实现（`createFetchTransport`）：
- 单事件 POST，无批量
- 无 Beacon / Image 降级
- 无失败重试 / 离线兜底
- 无自动 Breadcrumb 采集

SPEC §3.4 已明确定义生产级传输层契约：
- 批量队列：达到 `maxBatchSize`（默认 30）或 `flushInterval`（默认 5000ms）时 flush
- 多通道协商：`beacon` → `fetch` → `image`，auto 模式自动选择
- Beacon 64KB 限制：超限拆批 + 必送事件优先
- IndexedDB 兜底：失败写入 IDB，启动 + `online` 事件重试，最多 3 次，队列上限 500

SPEC §4.1.1 已定义 Breadcrumb 结构：
- 7 种 category：navigation / click / console / xhr / fetch / ui / custom
- 环形缓冲 maxBreadcrumbs（默认 100），FIFO 淘汰

## 决策

### 1. 模块划分

| 文件 | 职责 |
|---|---|
| `src/transport/types.ts` | Transport 接口（保持不变） |
| `src/transport/queue.ts` | **新增**：事件队列（内存 buffer + flush 逻辑 + maxBatchSize / flushInterval） |
| `src/transport/sender.ts` | **新增**：多通道发送器（beacon → fetch → image 降级链） |
| `src/transport/persistence.ts` | **新增**：IndexedDB 持久化（写入 / 读取 / 清理 / 重试计数） |
| `src/transport/index.ts` | **新增**：`createTransport(opts)` 工厂，组装 queue + sender + persistence |
| `src/transport/fetch.ts` | **废弃**：被 `index.ts` 替代 |
| `src/plugins/breadcrumb.ts` | **新增**：自动 Breadcrumb 采集插件 |

### 2. 传输层设计

```
事件产生 → beforeSend → 采样 → queue.enqueue(event)
                                       ↓
                    buffer.length >= maxBatchSize 或 timer 到期
                                       ↓
                              sender.sendBatch(events[])
                                       ↓
                     beacon(64KB 限) → fetch(keepalive) → image(单条 2KB)
                                       ↓ 失败
                        persistence.store(events[], retryCount)
                                       ↓
                    启动时 / online 事件 → persistence.retry()
```

**flush 时机**：
- `maxBatchSize` 达到（默认 30）
- `flushInterval` 到期（默认 5000ms）
- `pagehide` / `visibilitychange=hidden`
- 用户主动 `GHealClaw.flush()`

**Beacon 拆批**：序列化后 > 64KB → 按 event 拆分为多个 ≤ 64KB 子批次。

### 3. Breadcrumb 自动采集

| 类别 | 采集方式 | data 字段 |
|---|---|---|
| `navigation` | `history.pushState` / `popstate` patch | `{ from, to }` |
| `click` | 冒泡 `document.addEventListener('click')` | `{ selector, text, href? }` |
| `console` | `console.log/warn/error` patch | `{ level, args: truncated[] }` |
| `fetch` | `fetch` response 后记录 | `{ method, url, status, durationMs }` |
| `xhr` | XHR `loadend` 后记录 | `{ method, url, status, durationMs }` |

**与 httpPlugin / apiPlugin 的关系**：Breadcrumb 仅记录轨迹（附加到 error 事件），不上报独立事件；httpPlugin/apiPlugin 上报独立事件。两者互不冲突。

### 4. IndexedDB 持久化

- DB 名：`ghc-offline-queue`
- Store：`pending-events`
- 每条记录：`{ id: auto, events: SdkEvent[], retryCount: number, createdAt: number }`
- 容量限制：总事件数 ≤ 500；超出按 createdAt 最旧丢弃
- 重试策略：启动时 + `online` 事件 → 读取全部 → 逐批 sender.sendBatch → 成功删除 / 失败 retryCount++ → 超过 3 次永久删除
- 兜底：无 IndexedDB → 跳过持久化（不用 localStorage，避免同步阻塞主线程 + 5MB 限制）

### 5. 体积预算

| 模块 | 预估 gzip |
|---|---|
| queue.ts | +0.3KB |
| sender.ts | +0.5KB |
| persistence.ts | +1.5KB |
| breadcrumb.ts | +1.0KB |
| 总增 | ~3.3KB |
| 预算检查 | 当前 ~8KB + 3.3KB = ~11.3KB < 15KB ✅ |

## 备选方案

### 方案 B：使用 localForage 封装 IndexedDB

**否决**：引入第三方依赖增加 ~3KB gzip；SDK 仅需简单 CRUD，原生 IndexedDB API 足够。

### 方案 C：localStorage 替代 IndexedDB

**否决**：5MB 限制 + 同步阻塞 + 无法存储大量结构化数据 + Safari 隐私模式下可能不可用。

## 影响

- **SPEC**：无变更（§3.4 已定义，本次实现对齐）
- **ARCHITECTURE**：无变更（SDK 内部模块，不影响 server/web）
- **packages/sdk**：Transport 层重写 + 新增 breadcrumbPlugin
- **体积**：+3.3KB gzip（预算内）
- **对外 API**：无 breaking change（`init()` options 已定义 `transport` / `maxBatchSize` / `flushInterval`）

## 后续

- [ ] 实现完成后补充 demo 路径 + apps/docs 页面链接
- [ ] T1.2.7 采样 + `beforeSend` + `ignoreErrors` + 敏感字段过滤（基于本传输层）
- [ ] T1.2.8 SDK 构建优化（tree-shake Transport 通道）
