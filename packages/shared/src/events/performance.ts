import { z } from "zod";
import { BaseEventSchema, NavigationTimingSchema } from "./base.js";

/**
 * 性能事件（SPEC §4.2）
 *
 * FSP = 首屏时间（First Screen Paint，自定义实现，非 W3C 标准名）
 * TBT = Total Blocking Time（总阻塞时间）：FCP ~ TTI 窗口内长任务 sum(max(0, duration-50))，
 *       与 Lighthouse 口径一致；INP/FID 表达交互延迟，TBT 表达加载阶段的主线程阻塞，互补而非替代。
 *
 * 废弃指标（deprecated，保留上报/展示能力）：
 * - FID：First Input Delay，已被 INP 取代（web.dev 2024.3 起 Core Web Vital 切换）
 * - TTI：Time to Interactive，Google 不再维护 tti-polyfill，建议用 TBT / INP 替代
 *
 * 仍保留 enum 值，允许 SDK 上报 + 后端聚合 + 面板展示；UI 侧需渲染「已废弃」标识。
 *
 * Lighthouse 专属指标（实验室口径，在线端近似）：
 * - SI：Speed Index，Lighthouse 通过视频帧采样计算视觉完整度 AUC；SDK 端用
 *       rAF + paint timing 近似，精度低于 Lighthouse，仅供趋势参考。
 */
export const PerformanceEventSchema = BaseEventSchema.extend({
  type: z.literal("performance"),
  metric: z.enum([
    "LCP",
    "FCP",
    "CLS",
    "INP",
    "TTFB",
    "FSP",
    "FID",
    "TTI",
    "TBT",
    "SI",
  ]),
  value: z.number().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  navigation: NavigationTimingSchema.optional(),
});
export type PerformanceEvent = z.infer<typeof PerformanceEventSchema>;
