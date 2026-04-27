/**
 * @g-heal-claw/sdk — g-heal-claw 浏览器端 SDK（骨架阶段，T1.2.1 / ADR-0010）
 *
 * 设计要点：
 * - 零 Node.js API，浏览器兼容
 * - 事件契约从 @g-heal-claw/shared 消费，不重复造
 * - 失败场景静默降级：DSN 无效 / fetch 不可用 / 插件 setup 失败 均不抛错
 */

export { init } from "./init.js";
export { getCurrentHub, resetHub } from "./hub.js";
export {
  captureMessage,
  captureException,
  addBreadcrumb,
} from "./client.js";
export { parseDsn, type ParsedDsn } from "./dsn.js";
export type { GHealClawOptions } from "./options.js";
export type { Hub, Scope } from "./hub.js";
export type { Plugin } from "./plugin.js";
export type { Transport } from "./transport/types.js";
export {
  performancePlugin,
  type PerformancePluginOptions,
} from "./plugins/performance.js";

// 便于 UMD 脚本接入：提供一个扁平 namespace 对象
import { init as _init } from "./init.js";
import { getCurrentHub as _getCurrentHub } from "./hub.js";
import {
  captureMessage as _captureMessage,
  captureException as _captureException,
  addBreadcrumb as _addBreadcrumb,
} from "./client.js";
import { performancePlugin as _performancePlugin } from "./plugins/performance.js";
import type { Breadcrumb } from "@g-heal-claw/shared";
import type { GHealClawOptions } from "./options.js";

/**
 * 便于 CDN 用户直接调用：`GHealClaw.init(...)` / `GHealClaw.captureException(err)`
 *
 * bundler 用户推荐使用具名导入；此对象面向 UMD 场景。
 */
export const GHealClaw = {
  init: (options: GHealClawOptions) => _init(options),
  captureMessage: (message: string, level?: "info" | "warn" | "error") => {
    const hub = _getCurrentHub();
    return hub ? _captureMessage(hub, message, level) : undefined;
  },
  captureException: (err: unknown, ctx?: Record<string, unknown>) => {
    const hub = _getCurrentHub();
    return hub ? _captureException(hub, err, ctx) : undefined;
  },
  addBreadcrumb: (breadcrumb: Breadcrumb) => {
    const hub = _getCurrentHub();
    if (hub) _addBreadcrumb(hub, breadcrumb);
  },
  performancePlugin: _performancePlugin,
};

export default GHealClaw;
