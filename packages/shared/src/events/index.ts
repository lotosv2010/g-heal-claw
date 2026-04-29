// 桶式导出：事件 Schema + 类型
export {
  EventTypeSchema,
  type EventType,
  UserContextSchema,
  type UserContext,
  DeviceContextSchema,
  type DeviceContext,
  PageContextSchema,
  type PageContext,
  BreadcrumbSchema,
  type Breadcrumb,
  NavigationTimingSchema,
  type NavigationTiming,
  BaseEventSchema,
  type BaseEvent,
} from "./base.js";

export {
  ErrorEventSchema,
  type ErrorEvent,
  StackFrameSchema,
  type StackFrame,
  ResourceKindSchema,
  type ResourceKind,
  ErrorRequestSchema,
  type ErrorRequest,
} from "./error.js";
export { PerformanceEventSchema, type PerformanceEvent } from "./performance.js";
export {
  LongTaskEventSchema,
  type LongTaskEvent,
  LongTaskTierSchema,
  type LongTaskTier,
  LONG_TASK_TIER_THRESHOLDS,
  classifyLongTaskTier,
} from "./long-task.js";
export { ApiEventSchema, type ApiEvent } from "./api.js";
export {
  ResourceEventSchema,
  type ResourceEvent,
  ResourceCategorySchema,
  type ResourceCategory,
} from "./resource.js";
export { PageViewEventSchema, type PageViewEvent } from "./page-view.js";
export { PageDurationEventSchema, type PageDurationEvent } from "./page-duration.js";
export { CustomEventSchema, type CustomEvent } from "./custom-event.js";
export { CustomMetricSchema, type CustomMetric } from "./custom-metric.js";
export { CustomLogSchema, type CustomLog } from "./custom-log.js";
export { TrackEventSchema, type TrackEvent } from "./track.js";

export { SdkEventSchema, type SdkEvent } from "./union.js";
export { IngestRequestSchema, type IngestRequest } from "./ingest.js";
