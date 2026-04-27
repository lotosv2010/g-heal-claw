import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 页面访问事件（SPEC §3.3.5 / §4.2）
 *
 * SPA 路由切换也会触发，`isSpaNav=true` 以区分初次硬刷新。
 */
export const PageViewEventSchema = BaseEventSchema.extend({
  type: z.literal("page_view"),
  enterAt: z.number().int().nonnegative(),
  leaveAt: z.number().int().nonnegative().optional(),
  duration: z.number().nonnegative().optional(),
  loadType: z.enum(["navigate", "reload", "back_forward", "prerender"]),
  isSpaNav: z.boolean().default(false),
});
export type PageViewEvent = z.infer<typeof PageViewEventSchema>;
