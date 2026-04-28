import type { LongTaskEvent } from "@g-heal-claw/shared";
import { createBaseEvent } from "../event.js";
import type { Hub } from "../hub.js";
import type { Plugin } from "../plugin.js";

/**
 * LongTaskPlugin（ADR-0014 补充 / SPEC §3.3.2）
 *
 * 采集 `PerformanceObserver({ type: 'longtask' })` 产出的长任务（≥50ms 主线程阻塞）
 * 并映射为 `LongTaskEventSchema`（type = 'long_task'）事件批量上报，配合 Dashboard
 * "长任务" 顶部卡片 + TBT 聚合使用。
 *
 * 设计要点：
 * - 批量聚合：采集到的条目先放入 buffer，达到 `maxBatch` 或 `flushInterval` 时上报
 * - `pagehide` / `visibilitychange=hidden` 兜底 flush：短会话场景也不丢数据
 * - 失败静默：非浏览器 / 无 PerformanceObserver / 不支持 `longtask` → warn + no-op
 */
export interface LongTaskPluginOptions {
  /** 单条事件 duration 最小阈值（ms），默认 50 —— 对齐浏览器原生 "long task" 定义 */
  readonly minDurationMs?: number;
  /** 每批最多条数，达到后立即 flush；默认 20 */
  readonly maxBatch?: number;
  /** 周期性 flush 间隔（ms），默认 5000 */
  readonly flushIntervalMs?: number;
  /** 是否携带 attribution（归因子条目），默认 true；关闭可减少 payload */
  readonly reportAttribution?: boolean;
}

interface LongTaskEntry extends PerformanceEntry {
  readonly attribution?: ReadonlyArray<{
    readonly name: string;
    readonly entryType: string;
    readonly startTime: number;
    readonly duration: number;
  }>;
}

export function longTaskPlugin(opts: LongTaskPluginOptions = {}): Plugin {
  const minDurationMs = opts.minDurationMs ?? 50;
  const maxBatch = Math.max(1, opts.maxBatch ?? 20);
  const flushIntervalMs = Math.max(500, opts.flushIntervalMs ?? 5000);
  const reportAttribution = opts.reportAttribution ?? true;

  return {
    name: "long-task",
    setup(hub) {
      if (typeof window === "undefined" || typeof document === "undefined") {
        hub.logger.debug("long-task plugin: 非浏览器环境，跳过");
        return;
      }
      if (typeof PerformanceObserver === "undefined") {
        hub.logger.warn(
          "long-task plugin: 无 PerformanceObserver，降级为 no-op",
        );
        return;
      }
      // 特性探测：某些浏览器（Safari 旧版）不支持 longtask entryType
      const supported = PerformanceObserver.supportedEntryTypes?.includes(
        "longtask",
      );
      if (!supported) {
        hub.logger.warn("long-task plugin: 浏览器不支持 longtask，降级为 no-op");
        return;
      }

      const buffer: LongTaskEntry[] = [];
      let flushTimer: ReturnType<typeof setInterval> | null = null;

      const flush = (): void => {
        if (buffer.length === 0) return;
        const pending = buffer.splice(0, buffer.length);
        for (const entry of pending) {
          dispatchLongTask(hub, entry, reportAttribution);
        }
      };

      const enqueue = (entry: LongTaskEntry): void => {
        if (entry.duration < minDurationMs) return;
        buffer.push(entry);
        if (buffer.length >= maxBatch) flush();
      };

      let po: PerformanceObserver;
      try {
        po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) enqueue(e as LongTaskEntry);
        });
        po.observe({ type: "longtask", buffered: true });
      } catch (err) {
        hub.logger.error("long-task plugin: observe 失败", err);
        return;
      }

      flushTimer = setInterval(flush, flushIntervalMs);

      // 会话结束兜底：pagehide / visibilitychange=hidden 立即上报残留
      const onPageHide = (): void => {
        flush();
      };
      const onVisibility = (): void => {
        if (document.visibilityState === "hidden") flush();
      };
      window.addEventListener("pagehide", onPageHide, { once: true });
      document.addEventListener("visibilitychange", onVisibility);

      // 持久化清理钩子到 hub（后续 teardown API 接入时复用）
      hub.logger.debug("long-task plugin: 已启用");

      // 页面卸载时清理 timer —— pagehide only-once 足够，不额外 cleanup
      void flushTimer;
      void po;
    },
  };
}

function dispatchLongTask(
  hub: Hub,
  entry: LongTaskEntry,
  reportAttribution: boolean,
): void {
  const base = createBaseEvent(hub, "long_task");
  const event: LongTaskEvent = {
    ...base,
    type: "long_task",
    duration: Math.max(1, Math.round(entry.duration)),
    startTime: Math.max(0, Math.round(entry.startTime)),
    attribution:
      reportAttribution && entry.attribution && entry.attribution.length > 0
        ? entry.attribution.map((a) => ({
            name: a.name,
            entryType: a.entryType,
            startTime: Math.max(0, Math.round(a.startTime)),
            duration: Math.max(0, Math.round(a.duration)),
          }))
        : undefined,
  };
  hub.logger.debug("long-task dispatch", event.duration, "ms");
  void hub.transport.send(event);
}
