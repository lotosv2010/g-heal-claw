import type { PerformanceEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/**
 * SpeedIndexPlugin（ADR-0014 补充 / SPEC §3.3.1）
 *
 * Speed Index 是 Lighthouse 实验室指标，原始定义为：
 *   SI = ∫₀ᵀ (1 − visualCompleteness(t)) dt
 * 其中 visualCompleteness(t) 由视频帧与最终帧的视觉相似度决定。
 *
 * 浏览器端无法录制视频，只能做近似估算。本实现采用「里程碑采样近似」：
 *
 *   1) 通过 PerformanceObserver('paint', 'largest-contentful-paint') 获取关键里程碑：
 *        - t_fp   = first-paint
 *        - t_fcp  = first-contentful-paint
 *        - t_lcp  = largest-contentful-paint 最新值（持续累加）
 *   2) 将里程碑线性分配视觉完整度：
 *        t < t_fp   → vc = 0
 *        t_fp   → vc = 0.10   （页面开始出现像素）
 *        t_fcp  → vc = 0.50   （首个文本/图像）
 *        t_lcp  → vc = 1.00   （最大可见元素）
 *   3) 按梯形法计算 AUC：SI = Σ segment (1 − avg_vc) * Δt
 *
 * 采集时机：`load` 事件后等待 `settleMs`（默认 3000ms，让 LCP 稳定）上报一次。
 *
 * 与 Lighthouse 的差异：
 * - Lighthouse 以每一帧为采样点，SDK 只用 3 个里程碑 → 精度低
 * - Lighthouse 在 throttled CPU + 3G 下跑出实验室 SI；RUM 下是真实用户环境
 * - 数量级一般与 Lighthouse SI 接近（偏差 ±20%），趋势可用但不可替代
 *
 * 失败静默：非浏览器 / 无 PerformanceObserver / 无 paint 支持 → warn + no-op。
 */
export interface SpeedIndexPluginOptions {
  /** load 后等待多少毫秒再封板上报（让 LCP 稳定），默认 3000 */
  readonly settleMs?: number;
  /** first-paint 对应的视觉完整度，默认 0.10 */
  readonly fpCompleteness?: number;
  /** first-contentful-paint 对应的视觉完整度，默认 0.50 */
  readonly fcpCompleteness?: number;
  /** largest-contentful-paint 对应的视觉完整度，默认 1.00 */
  readonly lcpCompleteness?: number;
}

/** Web.dev / Lighthouse 阈值：good ≤ 3.4s / needs ≤ 5.8s */
const SI_RATING_THRESHOLDS = [3400, 5800] as const;

export function speedIndexPlugin(opts: SpeedIndexPluginOptions = {}): Plugin {
  const settleMs = Math.max(0, opts.settleMs ?? 3000);
  const fpCompleteness = clamp01(opts.fpCompleteness ?? 0.1);
  const fcpCompleteness = clamp01(opts.fcpCompleteness ?? 0.5);
  const lcpCompleteness = clamp01(opts.lcpCompleteness ?? 1.0);

  return {
    name: "speed-index",
    setup(hub) {
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("speed-index plugin: 非浏览器环境，跳过");
        return;
      }
      if (typeof PerformanceObserver === "undefined") {
        hub.logger.warn(
          "speed-index plugin: 无 PerformanceObserver，降级为 no-op",
        );
        return;
      }
      const supportedTypes = PerformanceObserver.supportedEntryTypes ?? [];
      if (!supportedTypes.includes("paint")) {
        hub.logger.warn("speed-index plugin: 浏览器不支持 paint，降级为 no-op");
        return;
      }

      let fpTime: number | null = null;
      let fcpTime: number | null = null;
      let lcpTime: number | null = null;
      let reported = false;

      const paintPo = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === "first-paint") fpTime = e.startTime;
          if (e.name === "first-contentful-paint") fcpTime = e.startTime;
        }
      });
      try {
        paintPo.observe({ type: "paint", buffered: true });
      } catch (err) {
        hub.logger.error("speed-index plugin: paint observe 失败", err);
        return;
      }

      let lcpPo: PerformanceObserver | null = null;
      if (supportedTypes.includes("largest-contentful-paint")) {
        lcpPo = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) lcpTime = last.startTime;
        });
        try {
          lcpPo.observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          lcpPo = null;
        }
      }

      const fire = (): void => {
        if (reported) return;
        reported = true;
        paintPo.disconnect();
        lcpPo?.disconnect();

        // FP 缺失时用 FCP 代偿；FCP 缺失时整体无法计算
        const fp = fpTime ?? fcpTime;
        if (fp == null || fcpTime == null) {
          hub.logger.debug("speed-index plugin: FP/FCP 缺失，跳过上报");
          return;
        }
        const lcp = lcpTime ?? fcpTime;

        const si = computeSpeedIndex({
          fp,
          fcp: fcpTime,
          lcp,
          fpCompleteness,
          fcpCompleteness,
          lcpCompleteness,
        });
        if (si == null || !Number.isFinite(si) || si <= 0) {
          hub.logger.debug("speed-index plugin: 计算结果无效，跳过上报");
          return;
        }
        dispatchSI(hub, Math.round(si));
      };

      // 页面卸载兜底
      const onPageHide = (): void => fire();
      window.addEventListener("pagehide", onPageHide, { once: true });

      // load + settleMs 正常路径
      const scheduleFire = (): void => {
        window.setTimeout(fire, settleMs);
      };
      if (document.readyState === "complete") {
        scheduleFire();
      } else {
        window.addEventListener("load", scheduleFire, { once: true });
      }
    },
  };
}

interface SpeedIndexInput {
  readonly fp: number;
  readonly fcp: number;
  readonly lcp: number;
  readonly fpCompleteness: number;
  readonly fcpCompleteness: number;
  readonly lcpCompleteness: number;
}

/**
 * 基于三里程碑（FP / FCP / LCP）的梯形法 AUC 计算
 *
 * 分段区间 + 对应平均 (1 − vc)：
 *  [0, fp]      : avg(1-0, 1-fp_c)     = 1 − fp_c/2
 *  [fp, fcp]    : 1 − (fp_c + fcp_c)/2
 *  [fcp, lcp]   : 1 − (fcp_c + lcp_c)/2
 *
 * 非递增里程碑（时间或完整度倒挂）跳过对应段。
 */
function computeSpeedIndex(input: SpeedIndexInput): number | null {
  const { fp, fcp, lcp, fpCompleteness, fcpCompleteness, lcpCompleteness } =
    input;
  if (fp < 0 || fcp < fp) return null;

  let si = 0;
  // 段 1：[0, fp] —— vc 从 0 线性到 fpCompleteness
  if (fp > 0) {
    si += fp * (1 - fpCompleteness / 2);
  }
  // 段 2：[fp, fcp]
  if (fcp > fp) {
    si += (fcp - fp) * (1 - (fpCompleteness + fcpCompleteness) / 2);
  }
  // 段 3：[fcp, lcp]
  if (lcp > fcp && lcpCompleteness > fcpCompleteness) {
    si += (lcp - fcp) * (1 - (fcpCompleteness + lcpCompleteness) / 2);
  }
  return si;
}

function dispatchSI(hub: Hub, valueMs: number): void {
  const base = createBaseEvent(hub, "performance");
  const rating: PerformanceEvent["rating"] =
    valueMs <= SI_RATING_THRESHOLDS[0]
      ? "good"
      : valueMs <= SI_RATING_THRESHOLDS[1]
        ? "needs-improvement"
        : "poor";
  const event: PerformanceEvent = {
    ...base,
    type: "performance",
    metric: "SI",
    value: Math.max(0, valueMs),
    rating,
  };
  hub.logger.debug("speed-index dispatch", valueMs, rating);
  void hub.transport.send(event);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
