import type {
  Breadcrumb,
  ErrorEvent as GhcErrorEvent,
  SdkEvent,
} from "@g-heal-claw/shared";
import type { Hub } from "./hub.js";
import { createBaseEvent } from "./event.js";

/** 手动 captureException 可选参数（subType 允许覆盖默认 "js"） */
export interface CaptureExceptionOptions {
  readonly context?: Record<string, unknown>;
  /**
   * 指定 ErrorEvent.subType；默认 "js"。
   *
   * 适用场景：白屏检测（white_screen）/ 框架错误（framework）等 SDK 未自动兜底的子类型。
   */
  readonly subType?: GhcErrorEvent["subType"];
}

/**
 * 把 Error 对象拆成 message + stack；骨架阶段不做 Sourcemap 还原
 */
function normalizeError(err: unknown): {
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    return { message: err.message || String(err), stack: err.stack };
  }
  return { message: typeof err === "string" ? err : JSON.stringify(err) };
}

/**
 * 手动上报自定义消息：落 custom_log 事件
 */
export function captureMessage(
  hub: Hub,
  message: string,
  level: "info" | "warn" | "error" = "info",
): string {
  const base = createBaseEvent(hub, "custom_log");
  const event: SdkEvent = {
    ...base,
    type: "custom_log",
    level,
    message,
    breadcrumbs: [...hub.scope.breadcrumbs],
  };
  dispatch(hub, event);
  return base.eventId;
}

/**
 * 手动捕获异常：落 error 事件
 *
 * @param ctx 可传 Record<string, unknown>（兼容旧签名 = 仅自定义 context），
 *            或 CaptureExceptionOptions（支持自定义 subType / context）
 */
export function captureException(
  hub: Hub,
  err: unknown,
  ctx?: Record<string, unknown> | CaptureExceptionOptions,
): string {
  const { message, stack } = normalizeError(err);
  const base = createBaseEvent(hub, "error");
  const { subType, context } = resolveCaptureOptions(ctx);
  const event: GhcErrorEvent = {
    ...base,
    type: "error",
    subType,
    message,
    stack,
    breadcrumbs: [...hub.scope.breadcrumbs],
    context: { ...base.context, ...context },
  };
  dispatch(hub, event);
  return base.eventId;
}

function resolveCaptureOptions(
  ctx: Record<string, unknown> | CaptureExceptionOptions | undefined,
): { subType: GhcErrorEvent["subType"]; context: Record<string, unknown> } {
  if (!ctx) return { subType: "js", context: {} };
  // 判定是否为 CaptureExceptionOptions（含 subType 或 context 键）
  if (isCaptureOptions(ctx)) {
    return {
      subType: ctx.subType ?? "js",
      context: ctx.context ?? {},
    };
  }
  return { subType: "js", context: ctx };
}

function isCaptureOptions(
  ctx: Record<string, unknown> | CaptureExceptionOptions,
): ctx is CaptureExceptionOptions {
  return "subType" in ctx || ("context" in ctx && typeof ctx.context === "object");
}

/**
 * 追加面包屑：写入 Hub Scope（不触发上报）
 */
export function addBreadcrumb(hub: Hub, breadcrumb: Breadcrumb): void {
  hub.addBreadcrumb(breadcrumb);
}

function dispatch(hub: Hub, event: SdkEvent): void {
  hub.logger.debug("dispatch event", event.type, event.eventId);
  // 骨架阶段即发即走；失败由 Transport 自行打日志，不回滚
  void hub.transport.send(event);
}
