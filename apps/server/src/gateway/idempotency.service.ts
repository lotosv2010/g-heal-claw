import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../shared/redis/redis.service.js";

/**
 * 幂等去重结果：同批拆分为"首次入库"与"重复丢弃"两组
 *
 * duplicates 不含任何错误语义；仅表示在窗口期内已观测过相同 eventId。
 */
export interface DedupResult<T> {
  readonly first: readonly T[];
  readonly duplicates: readonly T[];
}

/**
 * Gateway 幂等去重（T1.3.5 / ADR-0016 §2）
 *
 * 策略：Redis SET key NX PX ttl → 返回 "OK" 为首次，null 为重复。
 *  - key 前缀：`gw:dedup:<projectId>:<eventId>`
 *  - TTL：默认 24h，覆盖 SDK 重试窗口（beacon / fetch 重试队列）且不至于占满 Redis
 *  - Redis 不可用时（test 短路 / 连接错误）→ 放行全部事件，不破坏主链路
 *
 * 误判取舍：SETNX 先到先赢，同批不同节点重复时仍可能双写一次，可接受（raw 表 event_id UNIQUE 兜底）。
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  /** 24 小时（毫秒），与 SDK IndexedDB 兜底重试窗口对齐 */
  private static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

  public constructor(private readonly redis: RedisService) {}

  /**
   * 在 Redis 上并发执行 SETNX，按结果拆分首次 / 重复
   *
   * 所有 Redis 异常统一视为"放行"：记录 warn 日志，返回全部事件到 first。
   */
  public async dedup<T extends { readonly eventId: string; readonly projectId: string }>(
    events: readonly T[],
    ttlMs: number = IdempotencyService.DEFAULT_TTL_MS,
  ): Promise<DedupResult<T>> {
    if (events.length === 0) {
      return { first: [], duplicates: [] };
    }
    const client = this.redis.client;
    if (!client) {
      // Redis 未就绪 → 不做幂等；raw 表 UNIQUE 兜底，功能不阻塞
      return { first: events, duplicates: [] };
    }

    const keys = events.map((ev) => buildKey(ev.projectId, ev.eventId));
    try {
      const pipeline = client.pipeline();
      for (const key of keys) {
        pipeline.set(key, "1", "PX", ttlMs, "NX");
      }
      const replies = await pipeline.exec();
      if (!replies || replies.length !== events.length) {
        this.logger.warn("Redis pipeline 返回长度与事件数不匹配，放行全部");
        return { first: events, duplicates: [] };
      }
      const first: T[] = [];
      const duplicates: T[] = [];
      for (let i = 0; i < events.length; i += 1) {
        const reply = replies[i];
        const err = reply?.[0];
        const result = reply?.[1];
        if (err) {
          // 单条失败视为放行（保留数据），不影响其他条目分类
          this.logger.warn(`SETNX 失败 eventId=${events[i]!.eventId}: ${(err as Error).message}`);
          first.push(events[i]!);
          continue;
        }
        if (result === "OK") {
          first.push(events[i]!);
        } else {
          duplicates.push(events[i]!);
        }
      }
      return { first, duplicates };
    } catch (err) {
      this.logger.warn(
        `幂等去重异常（放行全部批次）：${(err as Error).message}`,
      );
      return { first: events, duplicates: [] };
    }
  }
}

function buildKey(projectId: string, eventId: string): string {
  return `gw:dedup:${projectId}:${eventId}`;
}
