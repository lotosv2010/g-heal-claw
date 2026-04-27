import { z } from "zod";

/**
 * SDK 支持的事件类型判别值
 *
 * 对齐 SPEC §4.2 事件子类型表；任何新增子类型必须同步判别联合与 Gateway 路由。
 */
export const EventTypeSchema = z.enum([
  "error",
  "performance",
  "long_task",
  "api",
  "resource",
  "page_view",
  "page_duration",
  "custom_event",
  "custom_metric",
  "custom_log",
  "track",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * 用户上下文
 */
export const UserContextSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().optional(),
});
export type UserContext = z.infer<typeof UserContextSchema>;

/**
 * 设备上下文（SPEC §4.1）
 */
export const DeviceContextSchema = z.object({
  ua: z.string(),
  os: z.string(),
  osVersion: z.string().optional(),
  browser: z.string(),
  browserVersion: z.string().optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "bot", "unknown"]),
  screen: z.object({
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    dpr: z.number().positive(),
  }),
  network: z
    .object({
      effectiveType: z.string(),
      rtt: z.number().nonnegative().optional(),
      downlink: z.number().nonnegative().optional(),
    })
    .optional(),
  language: z.string(),
  timezone: z.string(),
});
export type DeviceContext = z.infer<typeof DeviceContextSchema>;

/**
 * 页面上下文（SPEC §4.1）
 */
export const PageContextSchema = z.object({
  url: z.string().url(),
  path: z.string(),
  referrer: z.string().optional(),
  title: z.string().optional(),
  utm: z
    .object({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
      term: z.string().optional(),
      content: z.string().optional(),
    })
    .optional(),
  searchEngine: z.string().optional(),
  channel: z.string().optional(),
});
export type PageContext = z.infer<typeof PageContextSchema>;

/**
 * Breadcrumb 面包屑（SPEC §4.1.1）
 *
 * 默认最多 100 条，FIFO 淘汰，在 error / api / custom_log 事件中附带。
 */
export const BreadcrumbSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  category: z.enum([
    "navigation",
    "click",
    "console",
    "xhr",
    "fetch",
    "ui",
    "custom",
  ]),
  level: z.enum(["debug", "info", "warning", "error"]),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
});
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;

/**
 * 页面加载瀑布图（SPEC §4.2.1）
 *
 * 附带在 performance 事件中；后端按 stage 在 metric_minute 聚合。
 */
export const NavigationTimingSchema = z.object({
  dns: z.number().nonnegative(),
  tcp: z.number().nonnegative(),
  ssl: z.number().nonnegative().optional(),
  request: z.number().nonnegative(),
  response: z.number().nonnegative(),
  domParse: z.number().nonnegative(),
  domReady: z.number().nonnegative(),
  resourceLoad: z.number().nonnegative(),
  total: z.number().nonnegative(),
  redirect: z.number().nonnegative().optional(),
  type: z.enum(["navigate", "reload", "back_forward", "prerender"]),
});
export type NavigationTiming = z.infer<typeof NavigationTimingSchema>;

/**
 * 所有事件共享的基础字段（SPEC §4.1）
 *
 * 子类型 Schema 通过 `.extend({ type: z.literal('...'), ... })` 叠加自身字段。
 */
export const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  projectId: z.string().min(1),
  publicKey: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  type: EventTypeSchema,
  release: z.string().optional(),
  environment: z.string().optional(),
  sessionId: z.string().min(1),
  user: UserContextSchema.optional(),
  tags: z.record(z.string()).optional(),
  context: z.record(z.unknown()).optional(),
  device: DeviceContextSchema,
  page: PageContextSchema,
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;
