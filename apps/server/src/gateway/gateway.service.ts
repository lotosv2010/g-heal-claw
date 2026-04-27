import { Injectable, Logger } from "@nestjs/common";
import type { IngestRequest } from "./ingest.dto.js";

/**
 * Gateway Service（骨架阶段）
 *
 * 仅做：接收已通过 Zod 校验的批量事件 → 打日志 → 返回计数。
 * 后续 T1.3.2 会改为：按事件类型分发到对应 BullMQ 队列。
 */
@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  public ingest(payload: IngestRequest): { accepted: number } {
    const count = payload.events.length;
    this.logger.log(
      `accepted=${count} types=[${payload.events
        .map((e) => e.type)
        .join(",")}] dsn=${payload.dsn ?? "-"}`,
    );
    return { accepted: count };
  }
}
