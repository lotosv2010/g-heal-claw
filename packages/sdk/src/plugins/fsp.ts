import type { PerformanceEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/**
 * FSP（First Screen Paint，首屏时间）采集插件（ADR-0018 P0.3 / SPEC §3.3.2）
 *
 * 设计动机：
 *   - performancePlugin 中的 `domContentLoadedEventEnd - startTime` 近似仅反映 DOM 解析完成，
 *     对 SPA hydration 主导的页面会低估真实"用户看到首屏内容"的时间点。
 *   - 本插件采用 `MutationObserver + requestAnimationFrame` 观察首屏 DOM 变化，
 *     以最后一次有意义 DOM 变化的时间点近似 FSP，精度与业内通用实现（如阿里 FMP）相当。
 *
 * 算法：
 *   1) 安装 MutationObserver 监听 <body> 子树的 childList / subtree 变化
 *   2) 每次变化触发 requestAnimationFrame，回调中记录当前 `performance.now()`
 *   3) 若 `settleMs` 窗口内无新的变化则视为"首屏稳定" → 上报该时间点为 FSP
 *   4) `load` 事件兜底：若一直无 DOM 变化（纯静态页面），回退为 performance.timing 读数
 *   5) `pagehide` 兜底：页面卸载前未上报则强制封板一次
 *
 * 与 performancePlugin 中 DCL 方案互斥：注册本插件时建议同步传 `reportFSP: false` 给 performancePlugin，
 * 否则会产生两份 FSP 事件（后端聚合层按 metric='FSP' 混合后 p75 偏差更大）。
 *
 * 失败静默：非浏览器 / 无 MutationObserver → warn + no-op。
 */
export interface FspPluginOptions {
  /** DOM 稳定判定窗口（ms），默认 1000 —— 1s 内无变化视为首屏完成 */
  readonly settleMs?: number;
  /** 最小 FSP 值（ms），低于该值的判定视为误判丢弃；默认 100 */
  readonly minFspMs?: number;
  /** 最大 FSP 值（ms），超过后强制封板上报；默认 10000 */
  readonly maxFspMs?: number;
}

/** web.dev / Lighthouse FCP 对齐阈值：≤1.8s good / ≤3s needs / >3s poor */
const FSP_RATING_THRESHOLDS = [1800, 3000] as const;

export function fspPlugin(opts: FspPluginOptions = {}): Plugin {
  const settleMs = Math.max(100, opts.settleMs ?? 1000);
  const minFspMs = Math.max(0, opts.minFspMs ?? 100);
  const maxFspMs = Math.max(minFspMs + 1, opts.maxFspMs ?? 10_000);

  return {
    name: "fsp",
    setup(hub) {
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("fsp plugin: 非浏览器环境，跳过");
        return;
      }
      if (typeof MutationObserver === "undefined") {
        hub.logger.warn("fsp plugin: 无 MutationObserver，降级为 no-op");
        return;
      }

      let lastMutationMs: number | null = null;
      let reported = false;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;

      const markMutation = (): void => {
        if (reported) return;
        // rAF 对齐到下一次浏览器绘制 —— 更贴近"用户视觉感知"时点
        const raf =
          typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame
            : (cb: FrameRequestCallback) =>
                window.setTimeout(() => cb(performance.now()), 16);
        raf(() => {
          if (reported) return;
          lastMutationMs = performance.now();
          // 每次变化重置静默定时器
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => fireIfSettled(), settleMs);
        });
      };

      const fireIfSettled = (): void => {
        if (reported) return;
        if (lastMutationMs == null) return;
        fire(lastMutationMs);
      };

      const fire = (valueMs: number): void => {
        if (reported) return;
        reported = true;
        mo?.disconnect();
        if (settleTimer) clearTimeout(settleTimer);
        const clamped = Math.min(maxFspMs, Math.max(0, Math.round(valueMs)));
        if (clamped < minFspMs) {
          hub.logger.debug(
            `fsp plugin: value ${clamped} < minFspMs ${minFspMs}，跳过上报`,
          );
          return;
        }
        dispatchFsp(hub, clamped);
      };

      let mo: MutationObserver | null = null;
      const beginObserve = (): void => {
        if (!document.body) {
          // body 尚未就绪 —— 等下次轮询
          return;
        }
        try {
          mo = new MutationObserver(() => markMutation());
          mo.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: false,
            attributes: false,
          });
          // 静态页面（无 DOM 变化）由 load + settleMs 兜底路径负责，避免此处
          // 人为制造一次"基线变化"导致 settle 计时器被提前启动
        } catch (err) {
          hub.logger.error("fsp plugin: MutationObserver 绑定失败", err);
        }
      };

      // body 通常在 interactive 之后才存在；尽早开启观察
      if (document.body) {
        beginObserve();
      } else {
        // DOMContentLoaded 后 body 必定就绪
        document.addEventListener("DOMContentLoaded", beginObserve, {
          once: true,
        });
      }

      // load 兜底：仅在 load + settleMs 后仍无任何 DOM 变化时封板
      // （若 mutation 已发生则 settle 路径会自行上报，避免双通道干扰）
      const onLoad = (): void => {
        window.setTimeout(() => {
          if (reported) return;
          if (lastMutationMs != null) return;
          // 纯静态页面：用当前时间点作为 FSP 兜底值
          fire(performance.now());
        }, settleMs);
      };
      if (document.readyState === "complete") {
        onLoad();
      } else {
        window.addEventListener("load", onLoad, { once: true });
      }

      // pagehide 兜底：会话提前结束时强制封板
      window.addEventListener(
        "pagehide",
        () => {
          if (reported) return;
          fire(lastMutationMs ?? performance.now());
        },
        { once: true },
      );
    },
  };
}

function dispatchFsp(hub: Hub, valueMs: number): void {
  const base = createBaseEvent(hub, "performance");
  const rating: PerformanceEvent["rating"] =
    valueMs <= FSP_RATING_THRESHOLDS[0]
      ? "good"
      : valueMs <= FSP_RATING_THRESHOLDS[1]
        ? "needs-improvement"
        : "poor";
  const event: PerformanceEvent = {
    ...base,
    type: "performance",
    metric: "FSP",
    value: Math.max(0, valueMs),
    rating,
  };
  hub.logger.debug("fsp dispatch", valueMs, rating);
  void hub.transport.send(event);
}
