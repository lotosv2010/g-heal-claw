"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import {
  createRealtimeStream,
  stateToSource,
  type ConnectionState,
  type RealtimeEvent,
  type RealtimeTopic,
} from "@/lib/api/realtime";
import { LiveFeed } from "./live-feed";
import { StreamHeader } from "./stream-header";

const MAX_EVENTS = 500;
const QPS_WINDOW_MS = 10_000;

/**
 * 实时监控大盘（ADR-0030 / TM.2.C.5）
 *
 * - EventSource 订阅 `/api/v1/stream/realtime`
 * - 客户端保留最近 500 条，QPS 按 10s 滚动窗口本地计算
 * - topic 筛选 / 暂停 / 清空 控件
 * - readyState 映射 SourceBadge
 */
export default function RealtimePage() {
  const projectId =
    process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "proj_demo";

  const [state, setState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<readonly RealtimeEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [topics, setTopics] = useState<ReadonlySet<RealtimeTopic>>(
    () => new Set<RealtimeTopic>(["error", "api", "perf"]),
  );

  // QPS 窗口（仅统计，独立于 events 队列）
  const tsBufferRef = useRef<number[]>([]);
  const [qps, setQps] = useState(0);

  // pausedRef 用于订阅回调内即时读取暂停状态，避免闭包陈旧
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // 订阅的 topics 数组（stable 化以作为 effect 依赖）
  const topicList = useMemo(() => Array.from(topics), [topics]);
  const topicsKey = topicList.join(",");

  useEffect(() => {
    const handle = createRealtimeStream({
      projectId,
      topics: topicList,
      onState: setState,
      onEvent: (ev) => {
        // 统计 QPS 时戳（不受 pause 影响）
        const buffer = tsBufferRef.current;
        buffer.push(Date.now());
        // 回填 events 列表（pause 时丢弃新事件）
        if (pausedRef.current) return;
        setEvents((prev) => {
          const next = [ev, ...prev];
          if (next.length > MAX_EVENTS) next.length = MAX_EVENTS;
          return next;
        });
      },
    });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, topicsKey]);

  // 每秒 tick 计算滚动窗口 QPS
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - QPS_WINDOW_MS;
      const buffer = tsBufferRef.current;
      while (buffer.length > 0 && buffer[0]! < cutoff) buffer.shift();
      setQps(buffer.length / (QPS_WINDOW_MS / 1000));
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  const source = stateToSource(state);

  return (
    <div>
      <PageHeader
        title="实时监控"
        description="Redis Pub/Sub + SSE · error / api / perf 三个 topic"
        actions={<SourceBadge source={source} />}
      />

      <StreamHeader
        state={state}
        qps={qps}
        topics={topics}
        paused={paused}
        onToggleTopic={(t) => {
          setTopics((prev) => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            if (next.size === 0) next.add(t); // 至少保留 1 个
            return next;
          });
        }}
        onTogglePause={() => setPaused((p) => !p)}
        onClear={() => setEvents([])}
      />

      <LiveFeed events={events} />
    </div>
  );
}

function SourceBadge({ source }: { source: "live" | "empty" | "error" }) {
  if (source === "live") return <Badge variant="good">SSE 已连接</Badge>;
  if (source === "empty") return <Badge variant="warn">正在连接...</Badge>;
  return <Badge variant="destructive">SSE 断开 · 正在重连</Badge>;
}
