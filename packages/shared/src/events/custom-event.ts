import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 自定义事件（SPEC §3.3.6）：GHealClaw.track(eventName, properties)
 */
export const CustomEventSchema = BaseEventSchema.extend({
  type: z.literal("custom_event"),
  name: z.string().min(1),
  properties: z.record(z.unknown()).default({}),
});
export type CustomEvent = z.infer<typeof CustomEventSchema>;
