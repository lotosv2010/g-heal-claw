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
  type CaptureExceptionOptions,
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
export {
  errorPlugin,
  type ErrorPluginOptions,
} from "./plugins/error.js";
export {
  longTaskPlugin,
  type LongTaskPluginOptions,
} from "./plugins/long-task.js";
export {
  speedIndexPlugin,
  type SpeedIndexPluginOptions,
} from "./plugins/speed-index.js";
export { fspPlugin, type FspPluginOptions } from "./plugins/fsp.js";
export {
  httpPlugin,
  type HttpCaptureOptions,
  type ApiCodeContext,
} from "./plugins/http.js";
export { apiPlugin, type ApiPluginOptions } from "./plugins/api.js";
export {
  pageViewPlugin,
  type PageViewPluginOptions,
} from "./plugins/page-view.js";
export {
  resourcePlugin,
  type ResourcePluginOptions,
} from "./plugins/resource.js";
export {
  trackPlugin,
  track,
  type TrackPluginOptions,
  type TrackApi,
} from "./plugins/track.js";
export {
  customPlugin,
  track as trackCustom,
  time,
  log,
  type CustomPluginOptions,
} from "./plugins/custom.js";
export {
  breadcrumbPlugin,
  type BreadcrumbPluginOptions,
} from "./plugins/breadcrumb.js";

// 便于 UMD 脚本接入：提供一个扁平 namespace 对象
import { init as _init } from "./init.js";
import { getCurrentHub as _getCurrentHub } from "./hub.js";
import {
  captureMessage as _captureMessage,
  captureException as _captureException,
  addBreadcrumb as _addBreadcrumb,
  type CaptureExceptionOptions,
} from "./client.js";
import { performancePlugin as _performancePlugin } from "./plugins/performance.js";
import { errorPlugin as _errorPlugin } from "./plugins/error.js";
import { longTaskPlugin as _longTaskPlugin } from "./plugins/long-task.js";
import { speedIndexPlugin as _speedIndexPlugin } from "./plugins/speed-index.js";
import { fspPlugin as _fspPlugin } from "./plugins/fsp.js";
import { httpPlugin as _httpPlugin } from "./plugins/http.js";
import { apiPlugin as _apiPlugin } from "./plugins/api.js";
import { pageViewPlugin as _pageViewPlugin } from "./plugins/page-view.js";
import { resourcePlugin as _resourcePlugin } from "./plugins/resource.js";
import {
  trackPlugin as _trackPlugin,
  track as _track,
} from "./plugins/track.js";
import {
  customPlugin as _customPlugin,
  track as _trackCustom,
  time as _time,
  log as _log,
} from "./plugins/custom.js";
import { breadcrumbPlugin as _breadcrumbPlugin } from "./plugins/breadcrumb.js";
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
  captureException: (
    err: unknown,
    ctx?: Record<string, unknown> | CaptureExceptionOptions,
  ) => {
    const hub = _getCurrentHub();
    return hub ? _captureException(hub, err, ctx) : undefined;
  },
  addBreadcrumb: (breadcrumb: Breadcrumb) => {
    const hub = _getCurrentHub();
    if (hub) _addBreadcrumb(hub, breadcrumb);
  },
  performancePlugin: _performancePlugin,
  errorPlugin: _errorPlugin,
  longTaskPlugin: _longTaskPlugin,
  speedIndexPlugin: _speedIndexPlugin,
  fspPlugin: _fspPlugin,
  httpPlugin: _httpPlugin,
  apiPlugin: _apiPlugin,
  pageViewPlugin: _pageViewPlugin,
  resourcePlugin: _resourcePlugin,
  trackPlugin: _trackPlugin,
  customPlugin: _customPlugin,
  breadcrumbPlugin: _breadcrumbPlugin,
  /**
   * 业务埋点（customPlugin · ADR-0023）→ type='custom_event'
   *
   * 旧的 trackPlugin.track（type='track', trackType='code'）保留为 `trackDom`，
   * 供被动 DOM 埋点演示使用。
   */
  track: (name: string, properties?: Record<string, unknown>) =>
    _trackCustom(name, properties),
  trackDom: (name: string, properties?: Record<string, unknown>) =>
    _track(name, properties),
  time: (
    name: string,
    durationMs: number,
    properties?: Record<string, unknown>,
  ) => _time(name, durationMs, properties),
  log: (level: "info" | "warn" | "error", message: string, data?: unknown) =>
    _log(level, message, data),
};

export default GHealClaw;
