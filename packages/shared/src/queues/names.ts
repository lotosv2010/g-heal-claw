/**
 * BullMQ 队列名常量
 *
 * 生产端与消费端必须引用此处的常量，避免魔法字符串漂移。
 * 新增队列时必须同步更新 `docs/ARCHITECTURE.md §3.4` 队列清单。
 */
export const QueueName = {
  // -------- SDK 事件消费（ARCHITECTURE §3.4）--------
  EventsError: "events-error",
  EventsPerformance: "events-performance",
  EventsApi: "events-api",
  EventsResource: "events-resource",
  EventsVisit: "events-visit",
  EventsCustom: "events-custom",
  EventsTrack: "events-track",
  // -------- 告警与通知 --------
  AlertEvaluator: "alert-evaluator",
  Notifications: "notifications",
  // -------- AI 自愈 --------
  AiDiagnosis: "ai-diagnosis",
  AiHealFix: "ai-heal-fix",
  // -------- Sourcemap --------
  SourcemapWarmup: "sourcemap-warmup",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/**
 * 死信队列派生器
 *
 * 约定：任意队列 `x` 的 DLQ 统一为 `x-dlq`，由 `@OnQueueFailed` 重试耗尽后转投。
 */
export function dlqOf<Q extends QueueName>(queue: Q): `${Q}-dlq` {
  return `${queue}-dlq` as const;
}

/**
 * 所有队列的字面量只读列表（枚举/测试/运维巡检使用）
 */
export const ALL_QUEUES = Object.values(QueueName) as readonly QueueName[];

/**
 * 所有 DLQ 名
 */
export const ALL_DLQ_QUEUES = ALL_QUEUES.map((q) => dlqOf(q));
