import { Injectable, Logger } from "@nestjs/common";
import type { ErrorEvent } from "@g-heal-claw/shared";
import { ErrorsService } from "../errors/errors.service.js";
import {
  PerformanceService,
  type PerfOrLongTaskEvent,
} from "../performance/performance.service.js";
import type { IngestRequest } from "./ingest.dto.js";

/**
 * Gateway Service
 *
 * 职责：接收已通过 Zod 校验的批量事件 → 按 type 分流
 *  - performance / long_task：直接调用 PerformanceService 落库（ADR-0013）
 *  - error：直接调用 ErrorsService 落库（ADR-0016 §2，切片方案，不入队）
 *  - 其他类型：仅打日志（T1.3.2 会改为入队 BullMQ）
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
          .join(",")}] dsn=${payload.dsn ?? "-"}`,
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
