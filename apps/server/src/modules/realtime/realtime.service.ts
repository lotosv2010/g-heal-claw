import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Redis, type Redis as RedisClient } from "ioredis";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { RedisService } from "../../shared/redis/redis.service.js";
import {
  REALTIME_TOPICS,
  channelKey,
  channelPattern,
  streamKey,
  type RealtimePayload,
  type RealtimeTopic,
} from "./topics.js";

/**
 * SSE 订阅者回调：service 向 controller 推送事件
 *
 * id 是 stream entry id（`1730000000000-0`）或 pub/sub 时戳，用于 SSE `id:` 字段
 */
export type RealtimeListener = (
  id: string,
  payload: RealtimePayload,
) => void;

interface SubscriberEntry {
  readonly topics: ReadonlySet<RealtimeTopic>;
  readonly listener: RealtimeListener;
}

interface ProjectSubscriberSet {
  readonly projectId: string;
  readonly subscribers: Map<symbol, SubscriberEntry>;
}

/**
 * RealtimeService（ADR-0030 §2 / §4）
 *
 * - 维护按 projectId 分组的内存订阅池（controller 注册 / 取消注册回调）
 * - 单条共享 Redis SUBSCRIBE 连接，首个订阅者触发 psubscribe，最后一个取消触发 punsubscribe
 * - publish：Gateway 入库后 fire-and-forget 调用，XADD + PUBLISH 双写（Stream 做回放、Pub/Sub 做活跃推送）
 * - NODE_ENV=test / Redis 未建连：所有方法 no-op，保持单测零依赖
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly subscribersByProject = new Map<
    string,
    ProjectSubscriberSet
  >();
  private subscriber: RedisClient | null = null;
  private readonly subscribedPatterns = new Set<string>();

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly redis: RedisService,
  ) {}

  public async onModuleDestroy(): Promise<void> {
    this.subscribersByProject.clear();
    if (this.subscriber) {
      await this.subscriber.quit().catch(() => {
        /* 断开后 quit 抛错可忽略 */
      });
      this.subscriber = null;
    }
  }

  /**
   * Gateway 入库后调用，fire-and-forget 发布到 Redis
   *
   * - 采样：按 REALTIME_SAMPLE_RATE 随机丢弃（rate<1 时）
   * - 落 Stream（MAXLEN 近似裁剪）→ 再 PUBLISH，两者失败都不抛；publish 失败不回滚入库
   */
  public async publish(
    projectId: string,
    payload: RealtimePayload,
  ): Promise<void> {
    const client = this.redis.client;
    if (!client) return;
    const rate = this.env.REALTIME_SAMPLE_RATE;
    if (rate < 1 && Math.random() >= rate) return;

    const serialized = JSON.stringify(payload);
    try {
      // MAXLEN ~ 1000：`~` 走近似裁剪，Redis 更高效，MAXLEN 不保证精确
      await client.xadd(
        streamKey(projectId),
        "MAXLEN",
        "~",
        String(this.env.REALTIME_STREAM_MAXLEN),
        "*",
        "data",
        serialized,
      );
      await client.publish(channelKey(projectId, payload.topic), serialized);
    } catch (err) {
      // publish 失败不回滚入库（ADR-0030 §3 采样控制）
      this.logger.warn(
        `realtime publish 失败 project=${projectId} topic=${payload.topic}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Controller 注册 SSE 订阅者；返回取消注册函数，超出配额返回 null
   *
   * - 每 projectId 最多 REALTIME_MAX_CONN_PER_PROJECT 条（内存计数，超限直接拒绝）
   * - 首个 project 订阅者触发 psubscribe；全部取消后 punsubscribe（惰性清理）
   * - topics 为空则订阅全部 3 个 topic
   */
  public subscribe(
    projectId: string,
    topics: readonly RealtimeTopic[],
    listener: RealtimeListener,
  ): (() => void) | null {
    let entry = this.subscribersByProject.get(projectId);
    const current = entry?.subscribers.size ?? 0;
    if (current >= this.env.REALTIME_MAX_CONN_PER_PROJECT) {
      return null;
    }
    if (!entry) {
      entry = { projectId, subscribers: new Map() };
      this.subscribersByProject.set(projectId, entry);
      void this.ensurePatternSubscription(projectId);
    }
    const token = Symbol("realtime-subscriber");
    const effective = topics.length > 0 ? topics : REALTIME_TOPICS;
    entry.subscribers.set(token, {
      topics: new Set(effective),
      listener,
    });

    return (): void => {
      const set = this.subscribersByProject.get(projectId);
      if (!set) return;
      set.subscribers.delete(token);
      if (set.subscribers.size === 0) {
        this.subscribersByProject.delete(projectId);
        void this.removePatternSubscription(projectId);
      }
    };
  }

  /** 当前 project 的在线 SSE 连接数（用于 REALTIME_MAX_CONN_PER_PROJECT 限流） */
  public connectionCount(projectId: string): number {
    return this.subscribersByProject.get(projectId)?.subscribers.size ?? 0;
  }

  /**
   * Last-Event-ID 回放：客户端带了上次收到的 stream id → 读取之后的条目一次性回放
   *
   * 仅查询当前 MAXLEN 窗口内（约最近 1000 条）
   */
  public async replayAfter(
    projectId: string,
    lastId: string,
    topics: readonly RealtimeTopic[],
  ): Promise<Array<{ id: string; payload: RealtimePayload }>> {
    const client = this.redis.client;
    if (!client) return [];
    try {
      const entries = await client.xrange(streamKey(projectId), lastId, "+");
      return entries
        .map(([id, fields]: [string, string[]]) => {
          const dataIdx = fields.indexOf("data");
          if (dataIdx < 0 || dataIdx + 1 >= fields.length) return null;
          try {
            const payload = JSON.parse(fields[dataIdx + 1]!) as RealtimePayload;
            if (!topics.includes(payload.topic)) return null;
            return { id, payload };
          } catch {
            return null;
          }
        })
        .filter((x): x is { id: string; payload: RealtimePayload } => x !== null);
    } catch (err) {
      this.logger.warn(
        `realtime replay 失败 project=${projectId}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // -------- private --------

  /**
   * 懒初始化独立 subscriber 连接（ioredis 进入 subscribe 模式后不能再跑常规命令）
   * RedisService.client 用于常规命令，这里另建一条
   */
  private async ensurePatternSubscription(projectId: string): Promise<void> {
    if (this.env.NODE_ENV === "test") return;
    if (!this.subscriber) {
      this.subscriber = new Redis(this.env.REDIS_URL, {
        retryStrategy: (times: number): number => Math.min(times * 200, 10_000),
        maxRetriesPerRequest: null, // subscribe 模式下必须 null
        lazyConnect: false,
      });
      this.subscriber.on("pmessage", (_pattern, channel, message) => {
        this.dispatch(channel, message);
      });
      this.subscriber.on("error", (err: Error) => {
        this.logger.warn(`realtime subscriber 错误：${err.message}`);
      });
    }
    const pattern = channelPattern(projectId);
    if (this.subscribedPatterns.has(pattern)) return;
    try {
      await this.subscriber.psubscribe(pattern);
      this.subscribedPatterns.add(pattern);
    } catch (err) {
      this.logger.warn(
        `realtime psubscribe 失败 project=${projectId}: ${(err as Error).message}`,
      );
    }
  }

  private async removePatternSubscription(projectId: string): Promise<void> {
    if (!this.subscriber) return;
    const pattern = channelPattern(projectId);
    if (!this.subscribedPatterns.has(pattern)) return;
    try {
      await this.subscriber.punsubscribe(pattern);
      this.subscribedPatterns.delete(pattern);
    } catch (err) {
      this.logger.warn(
        `realtime punsubscribe 失败 project=${projectId}: ${(err as Error).message}`,
      );
    }
  }

  /** 解析 channel 中的 projectId，分派给对应订阅池（惰性解析，避免广播时重复正则） */
  private dispatch(channel: string, message: string): void {
    // channel 形如 rt:<pid>:<topic>
    const parts = channel.split(":");
    if (parts.length !== 3 || parts[0] !== "rt") return;
    const projectId = parts[1]!;
    const entry = this.subscribersByProject.get(projectId);
    if (!entry || entry.subscribers.size === 0) return;
    let payload: RealtimePayload;
    try {
      payload = JSON.parse(message) as RealtimePayload;
    } catch {
      return;
    }
    // 使用当前毫秒时戳作为 fallback id（Pub/Sub 没有原生 id）
    const id = `${payload.ts}-0`;
    for (const sub of entry.subscribers.values()) {
      if (!sub.topics.has(payload.topic)) continue;
      try {
        sub.listener(id, payload);
      } catch (err) {
        this.logger.warn(
          `realtime subscriber 抛错 project=${projectId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
