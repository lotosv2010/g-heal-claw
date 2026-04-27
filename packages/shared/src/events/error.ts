import { z } from "zod";
import { BaseEventSchema, BreadcrumbSchema } from "./base.js";

/**
 * 堆栈帧（Source Map 还原前的原始帧）
 */
export const StackFrameSchema = z.object({
  file: z.string(),
  function: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
});
export type StackFrame = z.infer<typeof StackFrameSchema>;

/**
 * 错误事件（SPEC §4.2）
 *
 * 指纹规则在后端计算：sha1(subType + normalizedMessage + topFrame.fileBase + topFrame.function)
 */
export const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal("error"),
  subType: z.enum(["js", "promise", "resource", "framework", "white_screen"]),
  message: z.string(),
  stack: z.string().optional(),
  frames: z.array(StackFrameSchema).optional(),
  componentStack: z.string().optional(),
  resource: z
    .object({
      url: z.string(),
      tagName: z.string(),
      outerHTML: z.string().optional(),
    })
    .optional(),
  breadcrumbs: z.array(BreadcrumbSchema).max(100).optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
