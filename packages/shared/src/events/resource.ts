import { z } from "zod";
import { BaseEventSchema } from "./base.js";

/**
 * 静态资源加载事件（SPEC §3.3.4 / §4.2 / ADR-0022）
 *
 * 6 类分类与 apiPlugin（fetch/XHR）形成 XOR 覆盖：
 *  - script / stylesheet / image / font / media / other
 *  - 明确排除 initiatorType in {fetch, xmlhttprequest, beacon}
 */
export const ResourceCategorySchema = z.enum([
  "script",
  "stylesheet",
  "image",
  "font",
  "media",
  "other",
]);
export type ResourceCategory = z.infer<typeof ResourceCategorySchema>;

export const ResourceEventSchema = BaseEventSchema.extend({
  type: z.literal("resource"),
  initiatorType: z.string(),
  /** 统一分类（ADR-0022，向后兼容 optional） */
  category: ResourceCategorySchema.optional(),
  /** 从 url 派生的 host（便于 CDN 聚合，向后兼容 optional） */
  host: z.string().optional(),
  url: z.string(),
  duration: z.number().nonnegative(),
  transferSize: z.number().int().nonnegative().optional(),
  encodedSize: z.number().int().nonnegative().optional(),
  decodedSize: z.number().int().nonnegative().optional(),
  protocol: z.string().optional(),
  cache: z.enum(["hit", "miss", "unknown"]).default("unknown"),
  /** 慢资源标记（duration > slowThresholdMs） */
  slow: z.boolean().optional(),
  /** 失败标记（RT 层 transferSize/decodedSize/responseStart 全零 或 duration=0） */
  failed: z.boolean().optional(),
  /** PerformanceEntry.startTime（相对时序调试） */
  startTime: z.number().nonnegative().optional(),
});
export type ResourceEvent = z.infer<typeof ResourceEventSchema>;
