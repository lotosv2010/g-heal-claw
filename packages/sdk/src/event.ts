import type { BaseEvent, EventType } from "@g-heal-claw/shared";
import type { Hub } from "./hub.js";
import { collectDevice, collectPage } from "./context.js";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * 基础事件工厂：填充所有事件共享的公共字段
 *
 * 调用方通过对象展开叠加子类型特定字段后交给 Transport 发送。
 */
export function createBaseEvent(
  hub: Hub,
  type: EventType,
): BaseEvent {
  return {
    eventId: uuid(),
    projectId: hub.dsn.projectId,
    publicKey: hub.dsn.publicKey,
    timestamp: Date.now(),
    type,
    release: hub.options.release,
    environment: hub.options.environment,
    sessionId: hub.sessionId,
    user: hub.scope.user,
    tags: { ...hub.scope.tags },
    context: { ...hub.scope.context },
    device: collectDevice(),
    page: collectPage(),
  };
}
