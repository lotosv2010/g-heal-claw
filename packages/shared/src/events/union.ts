import { z } from "zod";
import { ErrorEventSchema } from "./error.js";
import { PerformanceEventSchema } from "./performance.js";
import { LongTaskEventSchema } from "./long-task.js";
import { ApiEventSchema } from "./api.js";
import { ResourceEventSchema } from "./resource.js";
import { PageViewEventSchema } from "./page-view.js";
import { PageDurationEventSchema } from "./page-duration.js";
import { CustomEventSchema } from "./custom-event.js";
import { CustomMetricSchema } from "./custom-metric.js";
import { CustomLogSchema } from "./custom-log.js";
import { TrackEventSchema } from "./track.js";

/**
 * 所有 SDK 事件的判别联合（按 `type` 字段分流）
 *
 * Gateway 校验 + Processor 路由共用；新增事件类型必须同步：
 *   1. `events/<name>.ts` 新增子 Schema
 *   2. 在此加入 `z.discriminatedUnion` 选项
 *   3. `events/base.ts` 的 `EventTypeSchema` 枚举
 */
export const SdkEventSchema = z.discriminatedUnion("type", [
  ErrorEventSchema,
  PerformanceEventSchema,
  LongTaskEventSchema,
  ApiEventSchema,
  ResourceEventSchema,
  PageViewEventSchema,
  PageDurationEventSchema,
  CustomEventSchema,
  CustomMetricSchema,
  CustomLogSchema,
  TrackEventSchema,
]);
export type SdkEvent = z.infer<typeof SdkEventSchema>;
