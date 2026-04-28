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
 * 资源子分类（面向 SPEC 9 分类卡片）
 *
 * SDK 侧根据资源 tagName / URL 后缀决定：
 *  - js / js_load → `script`
 *  - css_load     → `link[rel=stylesheet]`
 *  - image_load   → `img / picture`
 *  - media        → `video / audio / source`
 *
 * 后端据此直接聚合 9 分类，无需再在前端派生。
 */
export const ResourceKindSchema = z.enum([
  "js_load",
  "css_load",
  "image_load",
  "media",
  "other",
]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

/**
 * HTTP 请求上下文（SPEC §4.2 / ajax / api_code）
 *
 * ajax         → 网络/超时/非 2xx HTTP 错误
 * api_code     → HTTP 成功但业务状态码异常（由 SDK 侧 apiCodeFilter 判定）
 */
export const ErrorRequestSchema = z.object({
  url: z.string(),
  method: z.string().optional(),
  /** HTTP 状态码，网络层失败时为 0 */
  status: z.number().int().nonnegative().optional(),
  statusText: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  /** 业务 code（来自 JSON body 的 code / errno 字段，用于 api_code 场景） */
  bizCode: z.union([z.string(), z.number()]).optional(),
  bizMessage: z.string().optional(),
});
export type ErrorRequest = z.infer<typeof ErrorRequestSchema>;

/**
 * 错误事件（SPEC §4.2）
 *
 * subType 对齐 SPEC 9 分类卡片：
 *  - js / promise / white_screen / framework → 原有
 *  - resource                               → 资源加载失败（子类型由 resource.kind 提供）
 *  - ajax                                    → 请求失败（网络/超时/非 2xx）
 *  - api_code                                → 业务状态码异常
 *
 * 指纹规则在后端计算：sha1(subType + normalizedMessage + topFrame.fileBase + topFrame.function)
 */
export const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal("error"),
  subType: z.enum([
    "js",
    "promise",
    "resource",
    "framework",
    "white_screen",
    "ajax",
    "api_code",
  ]),
  message: z.string(),
  stack: z.string().optional(),
  frames: z.array(StackFrameSchema).optional(),
  componentStack: z.string().optional(),
  resource: z
    .object({
      url: z.string(),
      tagName: z.string(),
      /** SDK 推断的资源分类；老版本 SDK 可能缺失（后端兜底为 other） */
      kind: ResourceKindSchema.optional(),
      outerHTML: z.string().optional(),
    })
    .optional(),
  request: ErrorRequestSchema.optional(),
  breadcrumbs: z.array(BreadcrumbSchema).max(100).optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
