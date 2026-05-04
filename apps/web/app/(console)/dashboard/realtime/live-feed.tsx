"use client";

import type { RealtimeEvent } from "@/lib/api/realtime";

export interface LiveFeedProps {
  readonly events: readonly RealtimeEvent[];
}

/**
 * 最近 500 条实时事件列表（ADR-0030 §5 · TM.2.C.5）
 *
 * - 采用简单溢出滚动容器（非虚拟列表，500 条 × 单行 DOM 在桌面端性能可接受）
 * - 按 topic 着色：error 红 / api 蓝 / perf 绿
 * - 时间戳统一本地 HH:mm:ss.SSS
 */
export function LiveFeed({ events }: LiveFeedProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        暂无事件。请确保 SDK 已接入并产生流量，或打开 Demo
        页触发 error / api / perf 样本。
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-xs text-muted-foreground">
        最近 {events.length} 条（最多保留 500 · FIFO）
      </div>
      <ul className="max-h-[520px] divide-y overflow-y-auto font-mono text-xs">
        {events.map((ev, idx) => (
          <li
            key={`${ev.ts}-${idx}`}
            className="flex items-start gap-3 px-3 py-1.5"
          >
            <span className="w-24 shrink-0 text-muted-foreground">
              {formatTime(ev.ts)}
            </span>
            <TopicTag topic={ev.topic} />
            <span className="min-w-0 flex-1 truncate">{describe(ev)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function TopicTag({ topic }: { topic: RealtimeEvent["topic"] }) {
  const color =
    topic === "error"
      ? "bg-red-500/15 text-red-700 dark:text-red-300"
      : topic === "api"
        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  return (
    <span
      className={
        "inline-block w-14 shrink-0 rounded px-1.5 py-0.5 text-center " + color
      }
    >
      {topic}
    </span>
  );
}

function describe(ev: RealtimeEvent): string {
  if (ev.topic === "error") {
    return `[${ev.subType}] ${ev.messageHead}${ev.url ? "  @ " + ev.url : ""}`;
  }
  if (ev.topic === "api") {
    return `${ev.method} ${ev.pathTemplate ?? ""} ${ev.status} · ${ev.durationMs.toFixed(0)}ms`;
  }
  return `${ev.metric} ${ev.value.toFixed(ev.metric === "CLS" ? 3 : 0)}${ev.metric === "CLS" ? "" : "ms"}${ev.url ? "  @ " + ev.url : ""}`;
}
