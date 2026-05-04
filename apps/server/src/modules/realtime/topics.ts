/**
 * Realtime topic 常量（ADR-0030 §3）
 *
 * Topic key 模板：`rt:<projectId>:<topic>`
 * Stream key 模板：`rt:<projectId>:stream`（所有 topic 共享一条 stream，通过 payload.topic 区分）
 *
 * - Pub/Sub：活跃订阅者通知
 * - Streams（MAXLEN 1000）：`Last-Event-ID` 回放窗口
 * - Web 侧不直接订阅 Redis，仅订阅 SSE，因此无需在 packages/shared 重复定义
 */

export const REALTIME_TOPICS = ["error", "api", "perf"] as const;
export type RealtimeTopic = (typeof REALTIME_TOPICS)[number];

/** Pub/Sub channel key */
export function channelKey(projectId: string, topic: RealtimeTopic): string {
  return `rt:${projectId}:${topic}`;
}

/** Pub/Sub pattern：订阅某 project 所有 topic */
export function channelPattern(projectId: string): string {
  return `rt:${projectId}:*`;
}

/** Stream key（所有 topic 共享）——便于 Last-Event-ID 顺序回放 */
export function streamKey(projectId: string): string {
  return `rt:${projectId}:stream`;
}

/** Stream MAXLEN 默认由 REALTIME_STREAM_MAXLEN 环境变量控制，此处仅为兜底 */
export const DEFAULT_STREAM_MAXLEN = 1000;

export interface RealtimeErrorPayload {
  readonly ts: number;
  readonly subType: string;
  readonly category?: string;
  readonly messageHead: string;
  readonly url?: string;
}

export interface RealtimeApiPayload {
  readonly ts: number;
  readonly method: string;
  readonly pathTemplate?: string;
  readonly status: number;
  readonly durationMs: number;
}

export interface RealtimePerfPayload {
  readonly ts: number;
  readonly metric: "LCP" | "INP" | "CLS";
  readonly value: number;
  readonly url?: string;
}

export type RealtimePayload =
  | ({ topic: "error" } & RealtimeErrorPayload)
  | ({ topic: "api" } & RealtimeApiPayload)
  | ({ topic: "perf" } & RealtimePerfPayload);
