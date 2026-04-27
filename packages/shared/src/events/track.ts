import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 埋点事件（SPEC §3.3.7）
 *
 * trackType=code   代码埋点（GHealClaw.track）
 * trackType=click  全埋点点击（含 data-track 元素）
 * trackType=expose 曝光（IntersectionObserver + 500ms 停留）
 * trackType=submit 表单提交
 */
export const TrackEventSchema = BaseEventSchema.extend({
  type: z.literal("track"),
  trackType: z.enum(["click", "expose", "submit", "code"]),
  target: z.object({
    tag: z.string().optional(),
    id: z.string().optional(),
    className: z.string().optional(),
    selector: z.string().optional(),
    text: z.string().optional(),
  }),
  properties: z.record(z.unknown()).default({}),
});
export type TrackEvent = z.infer<typeof TrackEventSchema>;
