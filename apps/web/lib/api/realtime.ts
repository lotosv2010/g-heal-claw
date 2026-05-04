/**
 * 实时监控 SSE 客户端封装（ADR-0030 / TM.2.C.5）
 *
 * - 直连 apps/server `/api/v1/stream/realtime`
 * - 断连自动重连，指数退避 1s→30s，最多 5 次
 * - EventSource.readyState → 三态 source（OPEN=live / CONNECTING=empty / ERROR=error）
 * - 浏览器原生 EventSource 会自动带上 `Last-Event-ID`，无需手动维护
 */

export type RealtimeTopic = "error" | "api" | "perf";

export interface RealtimeErrorPayload {
  readonly topic: "error";
  readonly ts: number;
  readonly subType: string;
  readonly category?: string;
  readonly messageHead: string;
  readonly url?: string;
}

export interface RealtimeApiPayload {
  readonly topic: "api";
  readonly ts: number;
  readonly method: string;
  readonly pathTemplate?: string;
  readonly status: number;
  readonly durationMs: number;
}

export interface RealtimePerfPayload {
  readonly topic: "perf";
  readonly ts: number;
  readonly metric: "LCP" | "INP" | "CLS";
  readonly value: number;
  readonly url?: string;
}

export type RealtimeEvent =
  | RealtimeErrorPayload
  | RealtimeApiPayload
  | RealtimePerfPayload;

export type ConnectionState = "connecting" | "open" | "error" | "closed";

export interface RealtimeStreamOptions {
  readonly projectId: string;
  readonly topics: readonly RealtimeTopic[];
  readonly onEvent: (event: RealtimeEvent) => void;
  readonly onState: (state: ConnectionState) => void;
}

export interface RealtimeStreamHandle {
  /** 断开连接并停止重连 */
  close(): void;
  /** 当前连接状态 */
  readonly state: ConnectionState;
}

const MAX_RETRIES = 5;
const BACKOFF_STEP_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

export function buildRealtimeUrl(projectId: string, topics: readonly RealtimeTopic[]): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const params = new URLSearchParams({ projectId });
  if (topics.length > 0) params.set("topics", topics.join(","));
  return `${baseUrl}/api/v1/stream/realtime?${params.toString()}`;
}

/**
 * 创建 SSE 订阅；内部自动管理重连
 */
export function createRealtimeStream(
  opts: RealtimeStreamOptions,
): RealtimeStreamHandle {
  let source: EventSource | null = null;
  let retryCount = 0;
  let closed = false;
  let state: ConnectionState = "connecting";
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const setState = (next: ConnectionState): void => {
    state = next;
    opts.onState(next);
  };

  const connect = (): void => {
    if (closed) return;
    setState("connecting");
    const url = buildRealtimeUrl(opts.projectId, opts.topics);
    const es = new EventSource(url, { withCredentials: false });
    source = es;

    es.onopen = (): void => {
      retryCount = 0;
      setState("open");
    };

    // 每 topic 一个 addEventListener 以便正确触发 `event:` 字段分发
    for (const topic of opts.topics.length > 0
      ? opts.topics
      : (["error", "api", "perf"] as const)) {
      es.addEventListener(topic, (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data) as RealtimeEvent;
          opts.onEvent(payload);
        } catch {
          /* 忽略非法 JSON */
        }
      });
    }

    es.onerror = (): void => {
      if (closed) return;
      es.close();
      source = null;
      retryCount += 1;
      if (retryCount > MAX_RETRIES) {
        setState("error");
        return;
      }
      const delay = Math.min(BACKOFF_STEP_MS * 2 ** (retryCount - 1), BACKOFF_CAP_MS);
      setState("error");
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close(): void {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (source) {
        source.close();
        source = null;
      }
      setState("closed");
    },
    get state(): ConnectionState {
      return state;
    },
  };
}

/** ConnectionState → SourceBadge 的三态映射（复用 overview 同一 UX 语义） */
export function stateToSource(
  state: ConnectionState,
): "live" | "empty" | "error" {
  if (state === "open") return "live";
  if (state === "connecting") return "empty";
  return "error";
}
