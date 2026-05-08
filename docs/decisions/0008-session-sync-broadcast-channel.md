# ADR-0008: 跨标签页 Session 同步走 BroadcastChannel + storage

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

SDK 需要在同一浏览器多标签页间共享 Session ID，确保：
- 同一用户同时打开多个标签页时归属同一 session
- 单个标签页 session 超时后不影响其他活跃标签页
- 标签页关闭后 session 仍可延续（30 分钟内重开视为同一 session）

约束条件：
- 不引入 SharedWorker（兼容性差、调试困难）
- 不依赖后端（纯客户端同步）
- SDK 体积预算限制（不引入第三方状态同步库）

## 决策

采用 **BroadcastChannel API + sessionStorage/localStorage 混合** 策略：

1. **SessionStorage** — 存储当前标签页的 sessionId（标签页隔离）
2. **LocalStorage** — 存储 `lastActiveTimestamp`，用于判断 session 是否过期（30 分钟）
3. **BroadcastChannel** — 新标签页打开时广播 `session_request`；已有标签页响应当前 sessionId
4. 流程：
   - 新标签页启动 → 检查 sessionStorage（有则复用）
   - 无 sessionStorage → 检查 localStorage `lastActive`（30 分钟内则复用 localStorage 中的 sessionId）
   - 超时 → 生成新 sessionId → 广播通知其他标签页同步

## 备选方案

| 方案 | 评估 |
|---|---|
| **SharedWorker** | 兼容性差（Safari 不支持）；调试工具缺乏；崩溃后所有标签页失联 |
| **IndexedDB 轮询** | 需要定时轮询（性能开销）；无实时通知能力 |
| **仅 LocalStorage storage 事件** | `storage` 事件仅在其他标签页触发（本标签页不收到）；需要额外 polyfill |
| **后端 Session 管理** | 增加后端复杂度；离线场景不可用；每次需要网络请求 |

## 影响

- **收益**：纯客户端实现；BroadcastChannel 实时同步（无轮询）；兼容现代浏览器
- **成本**：BroadcastChannel 在 IE/旧浏览器不可用
- **缓解**：检测 API 存在性，不可用时退化为仅 localStorage 模式（同 origin 共享）

## 后续

- 实现位于 `packages/sdk/src/session.ts`
- 30 分钟超时阈值通过 `init({ sessionTimeoutMs })` 可配置
