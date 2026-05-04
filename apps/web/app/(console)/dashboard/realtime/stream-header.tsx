"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConnectionState, RealtimeTopic } from "@/lib/api/realtime";

export interface StreamHeaderProps {
  readonly state: ConnectionState;
  readonly qps: number;
  readonly topics: ReadonlySet<RealtimeTopic>;
  readonly paused: boolean;
  readonly onToggleTopic: (topic: RealtimeTopic) => void;
  readonly onTogglePause: () => void;
  readonly onClear: () => void;
}

const ALL_TOPICS: readonly RealtimeTopic[] = ["error", "api", "perf"];

/** SSE 连接状态 + QPS + topic 筛选 + pause / clear 控件（ADR-0030 §5） */
export function StreamHeader({
  state,
  qps,
  topics,
  paused,
  onToggleTopic,
  onTogglePause,
  onClear,
}: StreamHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <StatusIndicator state={state} />
      <div className="text-sm">
        <span className="text-muted-foreground">QPS（近 10s）：</span>
        <span className="font-mono">{qps.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">topics：</span>
        {ALL_TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onToggleTopic(t)}
            className={
              "rounded border px-2 py-0.5 font-mono text-xs " +
              (topics.has(t)
                ? "border-foreground/40 bg-foreground/5"
                : "border-border text-muted-foreground")
            }
          >
            {topics.has(t) ? "✓ " : ""}
            {t}
          </button>
        ))}
      </div>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={onTogglePause}>
          {paused ? "继续" : "暂停"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          清空
        </Button>
      </div>
    </div>
  );
}

function StatusIndicator({ state }: { state: ConnectionState }) {
  if (state === "open") {
    return <Badge variant="good">● 已连接</Badge>;
  }
  if (state === "connecting") {
    return <Badge variant="warn">○ 连接中</Badge>;
  }
  if (state === "closed") {
    return <Badge variant="secondary">■ 已关闭</Badge>;
  }
  return <Badge variant="destructive">✕ 已断开</Badge>;
}
