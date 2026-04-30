import { Injectable, Logger } from "@nestjs/common";
import type { ErrorEvent } from "@g-heal-claw/shared";

/**
 * SourcemapService（TM.E.3 stub · ADR-0026）
 *
 * 本期仅提供纯函数级骨架：resolveFrames 原样返回事件，保证 ErrorProcessor
 * 链路可以独立投产。真实的堆栈还原（fetch from MinIO → parse → resolve）
 * 由后续 T1.5.3 切片实装，届时只需替换 resolveFrames 实现，接口保持不变。
 *
 * 强制契约：
 *  - 输入 / 输出都是 readonly ErrorEvent[]，保持引用透明
 *  - 永不抛错：任何还原失败都降级为原样返回（避免把 sourcemap 问题升级为事件丢失）
 */
@Injectable()
export class SourcemapService {
  private readonly logger = new Logger(SourcemapService.name);

  public async resolveFrames(
    events: readonly ErrorEvent[],
  ): Promise<readonly ErrorEvent[]> {
    // Stub：当前版本跳过还原。后续实装会基于 releaseId + filename + column 查询 MinIO 中对应 map。
    if (events.length > 0) {
      // 降级为 debug 级，避免生产日志噪声
      this.logger.debug?.(
        `sourcemap.resolveFrames (stub) events=${events.length}`,
      );
    }
    return events;
  }
}
