import { Injectable, Logger } from "@nestjs/common";
import type { ErrorEvent } from "@g-heal-claw/shared";
import { ErrorsService } from "../errors/errors.service.js";
import {
  PerformanceService,
  type PerfOrLongTaskEvent,
} from "../performance/performance.service.js";
import type { GatewayAuthContext } from "./dsn-auth.guard.js";
import type { IngestRequest } from "./ingest.dto.js";

/**
 * Gateway Service
 *
 * 职责：接收已通过 Zod 校验 + DSN 鉴权 的批量事件 → 按 type 分流
 *  - performance / long_task：调 PerformanceService 落库（ADR-0013）
 *  - error：调 ErrorsService 落库（ADR-0016 §2，切片方案，不入队）
 *  - 其他类型：暂仅记日志（BullMQ 入队由 T1.4.1 完整 Processor 接管）
 *
 * auth：来自 DsnAuthGuard 注入的 `req.auth`，承载可信 projectId / publicKey；
 * 本期尚未强制下游 Service 使用 auth.projectId（事件载荷自带 projectId），
 * 仅日志携带便于与 key 轮转同步排查。T1.4.1 会改为以 auth.projectId 为准。
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  public constructor(
    private readonly performance: PerformanceService,
    private readonly errors: ErrorsService,
  ) {}

  public async ingest(
    payload: IngestRequest,
    auth?: GatewayAuthContext,
  ): Promise<{ accepted: number; persisted: number }> {
    const total = payload.events.length;
    const perfEvents = payload.events.filter(isPerfOrLongTask);
    const errorEvents = payload.events.filter(isError);

    const [perfPersisted, errorPersisted] = await Promise.all([
      perfEvents.length ? this.performance.saveBatch(perfEvents) : 0,
      errorEvents.length ? this.errors.saveBatch(errorEvents) : 0,
    ]);
    const persisted = perfPersisted + errorPersisted;

    this.logger.log(
      `accepted=${total} perf=${perfEvents.length} errors=${errorEvents.length} ` +
        `persisted=${persisted} types=[${payload.events
          .map((e) => e.type)
          .join(",")}] projectId=${auth?.projectId ?? "-"} ` +
        `publicKey=${auth?.publicKey ?? "-"}`,
    );
    return { accepted: total, persisted };
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
