import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  QueueName,
  type ApiEvent,
  type CustomEvent,
  type CustomLog,
  type CustomMetric,
  type ErrorEvent,
  type PageViewEvent,
  type ResourceEvent,
  type TrackEvent,
} from "@g-heal-claw/shared";
import type { Queue } from "bullmq";
import { SERVER_ENV, type ServerEnv } from "../config/env.js";
import { ApiService } from "../modules/api/api.service.js";
import { CustomEventsService } from "../modules/custom/custom-events.service.js";
import { CustomMetricsService } from "../modules/custom/custom-metrics.service.js";
import type { ErrorJobPayload } from "../modules/errors/error.processor.js";
import { ErrorsService } from "../modules/errors/errors.service.js";
import { LogsService } from "../modules/logs/logs.service.js";
import {
  PerformanceService,
  type PerfOrLongTaskEvent,
} from "../modules/performance/performance.service.js";
import { ResourcesService } from "../modules/resources/resources.service.js";
import { TrackingService } from "../modules/tracking/tracking.service.js";
import { VisitsService } from "../modules/visits/visits.service.js";
import { RealtimeService } from "../modules/realtime/realtime.service.js";
import type {
  RealtimeApiPayload,
  RealtimeErrorPayload,
  RealtimePerfPayload,
} from "../modules/realtime/topics.js";
import type { PerfJobPayload } from "../modules/performance/perf.processor.js";
import type { GatewayAuthContext } from "./dsn-auth.guard.js";
import { IdempotencyService } from "./idempotency.service.js";
import type { IngestRequest } from "./ingest.dto.js";

/**
 * Gateway Service
 *
 * 职责：接收已通过 Zod 校验 + DSN 鉴权 的批量事件 → 按 type 分流
 *  - performance / long_task：调 PerformanceService 落库（ADR-0013）
 *  - error：按 ERROR_PROCESSOR_MODE 决定同步落库 / 异步入队 / 双写（TM.E.2 / ADR-0026）
 *  - 其他类型：仍同步落库（后续 TM.E+1 按同样模式迁移）
 *
 * auth：来自 DsnAuthGuard 注入的 `req.auth`，承载可信 projectId / publicKey；
 * 本期仅日志携带便于排查，不强制覆写事件载荷的 projectId。
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private queueDegraded = false;
  private perfQueueDegraded = false;

  public constructor(
    private readonly performance: PerformanceService,
    private readonly errors: ErrorsService,
    private readonly apiMonitor: ApiService,
    private readonly tracking: TrackingService,
    private readonly resourceMonitor: ResourcesService,
    private readonly customEvents: CustomEventsService,
    private readonly customMetrics: CustomMetricsService,
    private readonly logs: LogsService,
    private readonly visits: VisitsService,
    private readonly realtime: RealtimeService,
    private readonly idempotency: IdempotencyService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @InjectQueue(QueueName.EventsError)
    private readonly errorQueue: Queue<ErrorJobPayload>,
    @InjectQueue(QueueName.EventsPerformance)
    private readonly perfQueue: Queue<PerfJobPayload>,
  ) {}

  public async ingest(
    payload: IngestRequest,
    auth?: GatewayAuthContext,
  ): Promise<{
    accepted: number;
    persisted: number;
    duplicates: number;
    enqueued: number;
  }> {
    const total = payload.events.length;
    // T1.3.5：按 eventId Redis SETNX 去重；Redis 不可用时放行（raw UNIQUE 兜底）
    const { first, duplicates } = await this.idempotency.dedup(payload.events);

    const perfEvents = first.filter(isPerfOrLongTask);
    const errorEvents = first.filter(isError);
    const apiEvents = first.filter(isApi);
    const trackEvents = first.filter(isTrack);
    const resourceEvents = first.filter(isResource);
    const customEvents = first.filter(isCustomEvent);
    const customMetrics = first.filter(isCustomMetric);
    const customLogs = first.filter(isCustomLog);
    const pageViewEvents = first.filter(isPageView);

    // TM.E.2：根据 ERROR_PROCESSOR_MODE 决定错误事件去向
    const errorMode = this.resolveErrorMode();
    const errorSyncPromise =
      errorEvents.length && errorMode !== "queue"
        ? this.errors.saveBatch(errorEvents)
        : Promise.resolve(0);
    const errorEnqueuePromise =
      errorEvents.length && errorMode !== "sync"
        ? this.enqueueErrorBatch(errorEvents)
        : Promise.resolve(0);

    // T2.1.4.2 / ADR-0037：根据 PERF_PROCESSOR_MODE 决定性能事件去向
    const perfMode = this.resolvePerfMode();
    const perfSyncPromise =
      perfEvents.length && perfMode !== "queue"
        ? this.performance.saveBatch(perfEvents)
        : Promise.resolve(0);
    const perfEnqueuePromise =
      perfEvents.length && perfMode !== "sync"
        ? this.enqueuePerfBatch(perfEvents)
        : Promise.resolve(0);

    const [
      perfPersisted,
      perfEnqueued,
      errorPersisted,
      errorEnqueued,
      apiPersisted,
      trackPersisted,
      resourcePersisted,
      customEventPersisted,
      customMetricPersisted,
      customLogPersisted,
      pageViewPersisted,
    ] = await Promise.all([
      perfSyncPromise,
      perfEnqueuePromise,
      errorSyncPromise,
      errorEnqueuePromise,
      apiEvents.length ? this.apiMonitor.saveBatch(apiEvents) : 0,
      trackEvents.length ? this.tracking.saveBatch(trackEvents) : 0,
      resourceEvents.length
        ? this.resourceMonitor.saveBatch(resourceEvents)
        : 0,
      customEvents.length ? this.customEvents.saveBatch(customEvents) : 0,
      customMetrics.length ? this.customMetrics.saveBatch(customMetrics) : 0,
      customLogs.length ? this.logs.saveBatch(customLogs) : 0,
      pageViewEvents.length ? this.visits.saveBatch(pageViewEvents) : 0,
    ]);
    const persisted =
      perfPersisted +
      errorPersisted +
      apiPersisted +
      trackPersisted +
      resourcePersisted +
      customEventPersisted +
      customMetricPersisted +
      customLogPersisted +
      pageViewPersisted;
    const enqueued = errorEnqueued + perfEnqueued;

    // ADR-0030 / TM.2.C：入库后 fire-and-forget 推送到实时大盘
    // publish 失败不影响入库 ack（RealtimeService 内已吞异常并日志降级）
    this.publishRealtime(errorEvents, apiEvents, perfEvents);

    this.logger.log(
      `accepted=${total} deduped=${duplicates.length} perf=${perfEvents.length} perfMode=${perfMode} ` +
        `errors=${errorEvents.length} errorMode=${errorMode} ` +
        `enqueued=${enqueued} ` +
        `apis=${apiEvents.length} tracks=${trackEvents.length} ` +
        `resources=${resourceEvents.length} customEvents=${customEvents.length} ` +
        `customMetrics=${customMetrics.length} customLogs=${customLogs.length} ` +
        `pageViews=${pageViewEvents.length} ` +
        `persisted=${persisted} ` +
        `types=[${payload.events.map((e) => e.type).join(",")}] ` +
        `projectId=${auth?.projectId ?? "-"} publicKey=${auth?.publicKey ?? "-"}`,
    );
    return {
      accepted: total,
      persisted,
      duplicates: duplicates.length,
      enqueued,
    };
  }

  /**
   * 将本批次 error / api / perf 事件推送到实时大盘（ADR-0030 §3）
   *
   * - 按 projectId 分桶；实际 publish 交由 RealtimeService 按 REALTIME_SAMPLE_RATE 采样
   * - 不 await，publish 失败在 RealtimeService 内吞异常并日志降级
   * - perf 仅挑 LCP/INP/CLS 三个核心 Web Vitals（其他指标噪声大不上大盘）
   */
  private publishRealtime(
    errorEvents: readonly ErrorEvent[],
    apiEvents: readonly ApiEvent[],
    perfEvents: readonly PerfOrLongTaskEvent[],
  ): void {
    for (const event of errorEvents) {
      const payload: { topic: "error" } & RealtimeErrorPayload = {
        topic: "error",
        ts: event.timestamp,
        subType: event.subType,
        messageHead: truncate(event.message, 160),
        url: event.page.url,
      };
      void this.realtime.publish(event.projectId, payload);
    }
    for (const event of apiEvents) {
      const payload: { topic: "api" } & RealtimeApiPayload = {
        topic: "api",
        ts: event.timestamp,
        method: event.method,
        pathTemplate: extractPath(event.url),
        status: event.status,
        durationMs: event.duration,
      };
      void this.realtime.publish(event.projectId, payload);
    }
    for (const event of perfEvents) {
      if (event.type !== "performance") continue;
      if (
        event.metric !== "LCP" &&
        event.metric !== "INP" &&
        event.metric !== "CLS"
      ) {
        continue;
      }
      const payload: { topic: "perf" } & RealtimePerfPayload = {
        topic: "perf",
        ts: event.timestamp,
        metric: event.metric,
        value: event.value,
        url: event.page.url,
      };
      void this.realtime.publish(event.projectId, payload);
    }
  }

  /**
   * 解析当前生效的 error 处理模式
   *
   * queue 模式下如果 Redis 曾经 enqueue 失败，降级为 sync（避免丢事件）；
   * 降级态一旦进入本进程生命周期内不会自愈（服务重启后重新评估），
   * 运维可观察 queueDegraded 日志决定是否回滚 env。
   */
  private resolveErrorMode(): "sync" | "queue" | "dual" {
    const configured = this.env.ERROR_PROCESSOR_MODE;
    if (configured === "queue" && this.queueDegraded) return "sync";
    return configured;
  }

  /**
   * 将错误事件批次投递到 events-error 队列
   *
   * - attempts / backoff 来自 env，便于压测期间灰度调参
   * - Redis 不可用 → 记录降级态并抛错；调用方捕获后在 dual 模式下仍能同步落库
   */
  private async enqueueErrorBatch(
    events: readonly ErrorEvent[],
  ): Promise<number> {
    try {
      await this.errorQueue.add(
        "ingest",
        {
          events,
          enqueuedAt: Date.now(),
        },
        {
          attempts: this.env.ERROR_PROCESSOR_ATTEMPTS,
          backoff: {
            type: "exponential",
            delay: this.env.ERROR_PROCESSOR_BACKOFF_MS,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      );
      return events.length;
    } catch (err) {
      this.queueDegraded = true;
      this.logger.warn(
        `events-error enqueue 失败，本进程降级为 sync 模式：${(err as Error).message}`,
      );
      // queue 模式：在 resolveErrorMode 下一次入参时回退 sync，此次调用作为补偿也同步落库
      if (this.env.ERROR_PROCESSOR_MODE === "queue") {
        await this.errors.saveBatch(events);
      }
      return 0;
    }
  }

  /** T2.1.4.2 / ADR-0037：解析 perf 处理模式 */
  private resolvePerfMode(): "sync" | "queue" | "dual" {
    const configured = this.env.PERF_PROCESSOR_MODE;
    if (configured === "queue" && this.perfQueueDegraded) return "sync";
    return configured;
  }

  /** T2.1.4.2 / ADR-0037：将性能事件批次投递到 events-performance 队列 */
  private async enqueuePerfBatch(
    events: readonly PerfOrLongTaskEvent[],
  ): Promise<number> {
    try {
      await this.perfQueue.add(
        "ingest",
        {
          events,
          enqueuedAt: Date.now(),
        },
        {
          attempts: this.env.PERF_PROCESSOR_ATTEMPTS,
          backoff: {
            type: "exponential",
            delay: this.env.PERF_PROCESSOR_BACKOFF_MS,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      );
      return events.length;
    } catch (err) {
      this.perfQueueDegraded = true;
      this.logger.warn(
        `events-performance enqueue 失败，本进程降级为 sync 模式：${(err as Error).message}`,
      );
      if (this.env.PERF_PROCESSOR_MODE === "queue") {
        await this.performance.saveBatch(events);
      }
      return 0;
    }
  }
}

function isPerfOrLongTask(
  event: IngestRequest["events"][number],
): event is PerfOrLongTaskEvent {
  return event.type === "performance" || event.type === "long_task";
}

function isError(event: IngestRequest["events"][number]): event is ErrorEvent {
  return event.type === "error";
}

function isApi(event: IngestRequest["events"][number]): event is ApiEvent {
  return event.type === "api";
}

function isTrack(
  event: IngestRequest["events"][number],
): event is TrackEvent {
  return event.type === "track";
}

function isResource(
  event: IngestRequest["events"][number],
): event is ResourceEvent {
  return event.type === "resource";
}

function isCustomEvent(
  event: IngestRequest["events"][number],
): event is CustomEvent {
  return event.type === "custom_event";
}

function isCustomMetric(
  event: IngestRequest["events"][number],
): event is CustomMetric {
  return event.type === "custom_metric";
}

function isCustomLog(
  event: IngestRequest["events"][number],
): event is CustomLog {
  return event.type === "custom_log";
}

function isPageView(
  event: IngestRequest["events"][number],
): event is PageViewEvent {
  return event.type === "page_view";
}

function truncate(input: string, limit: number): string {
  if (input.length <= limit) return input;
  return `${input.slice(0, limit)}…`;
}

/** 从完整 URL 提取 pathname，解析失败回退原值 */
function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
