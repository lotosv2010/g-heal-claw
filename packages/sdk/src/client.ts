import type {
  Breadcrumb,
  ErrorEvent as GhcErrorEvent,
  SdkEvent,
} from "@g-heal-claw/shared";
import type { Hub } from "./hub.js";
import { createBaseEvent } from "./event.js";

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
 * 手动捕获异常：落 error 事件（骨架 subType 固定为 js）
 */
export function captureException(
  hub: Hub,
  err: unknown,
  ctx?: Record<string, unknown>,
): string {
  const { message, stack } = normalizeError(err);
  const base = createBaseEvent(hub, "error");
  const event: GhcErrorEvent = {
    ...base,
    type: "error",
    subType: "js",
    message,
    stack,
    breadcrumbs: [...hub.scope.breadcrumbs],
    context: { ...base.context, ...(ctx ?? {}) },
  };
  dispatch(hub, event);
  return base.eventId;
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
