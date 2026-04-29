import { Inject, Injectable, Logger } from "@nestjs/common";
import { SERVER_ENV, type ServerEnv } from "../config/env.js";
import { RedisService } from "../shared/redis/redis.service.js";

/**
 * 令牌桶 Lua（Redis，原子执行）
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity           令牌桶容量（burst）
 * ARGV[2] = refill_per_sec     每秒补充速率
 * ARGV[3] = now_ms             当前毫秒时间戳
 * ARGV[4] = requested          本次请求消耗令牌数
 *
 * 返回：{ allowed(0|1), remaining, retry_after_ms }
 *
 * 数据结构：HASH { tokens, last_ms }；TTL 为 2 * capacity / refill_per_sec，防止冷 key 累积
 * 精度：以浮点令牌计数，单次请求 1 令牌即足够；不做小数溢出处理
 */
const TOKEN_BUCKET_LUA = `
local key          = KEYS[1]
local capacity     = tonumber(ARGV[1])
local refill_rate  = tonumber(ARGV[2])
local now_ms       = tonumber(ARGV[3])
local requested    = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last_ms')
local tokens  = tonumber(bucket[1])
local last_ms = tonumber(bucket[2])

if tokens == nil then
  tokens  = capacity
  last_ms = now_ms
end

local delta_ms = math.max(0, now_ms - last_ms)
local refill   = (delta_ms / 1000.0) * refill_rate
tokens = math.min(capacity, tokens + refill)

local allowed = 0
local retry_after_ms = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  local deficit = requested - tokens
  if refill_rate > 0 then
    retry_after_ms = math.ceil((deficit / refill_rate) * 1000)
  else
    retry_after_ms = -1
  end
end

redis.call('HMSET', key, 'tokens', tokens, 'last_ms', now_ms)
-- TTL 兜底：2 倍桶满时间，防止不活跃 key 常驻
local ttl_sec = math.max(60, math.ceil((capacity / math.max(refill_rate, 0.0001)) * 2))
redis.call('EXPIRE', key, ttl_sec)

return {allowed, math.floor(tokens), retry_after_ms}
`.trim();

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
}

/**
 * 项目级限流（T1.3.3 / ADR-0016 §4）
 *
 * 策略：Redis 令牌桶（原子 Lua）
 *  - Key：`gw:rl:<projectId>`
 *  - 默认容量 = GATEWAY_RATE_LIMIT_BURST（默认 200）
 *  - 默认速率 = GATEWAY_RATE_LIMIT_PER_SEC（默认 100/s）
 *  - 每次请求消费 1 令牌（按批次而非事件数；事件数内聚合由内部 saveBatch 控制）
 *
 * 降级：Redis 不可用 / Lua 执行失败 → 放行并记录告警日志（不能因限流层挂掉导致主链路中断）
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  private readonly capacity: number;
  private readonly refillRate: number;
  private scriptSha: string | null = null;

  public constructor(
    private readonly redis: RedisService,
    @Inject(SERVER_ENV) env: ServerEnv,
  ) {
    this.capacity = env.GATEWAY_RATE_LIMIT_BURST;
    this.refillRate = env.GATEWAY_RATE_LIMIT_PER_SEC;
  }

  public async consume(
    projectId: string,
    tokens = 1,
  ): Promise<RateLimitResult> {
    const client = this.redis.client;
    if (!client) {
      // Redis 缺席 → 放行（test / dev 默认路径）
      return { allowed: true, remaining: this.capacity, retryAfterMs: 0 };
    }
    try {
      const sha = await this.ensureScript(client);
      const key = buildKey(projectId);
      // ioredis evalsha/eval 返回 unknown[]；手动类型收窄
      const result = (await client.evalsha(
        sha,
        1,
        key,
        String(this.capacity),
        String(this.refillRate),
        String(Date.now()),
        String(tokens),
      )) as readonly [number, number, number];
      return {
        allowed: result[0] === 1,
        remaining: Number(result[1]),
        retryAfterMs: Number(result[2]),
      };
    } catch (err) {
      this.logger.warn(
        `限流脚本执行失败 projectId=${projectId}（放行）：${(err as Error).message}`,
      );
      return { allowed: true, remaining: this.capacity, retryAfterMs: 0 };
    }
  }

  private async ensureScript(
    client: NonNullable<RedisService["client"]>,
  ): Promise<string> {
    if (this.scriptSha) return this.scriptSha;
    const sha = await client.script("LOAD", TOKEN_BUCKET_LUA);
    if (typeof sha !== "string") {
      throw new Error("SCRIPT LOAD 未返回 sha");
    }
    this.scriptSha = sha;
    return sha;
  }
}

function buildKey(projectId: string): string {
  return `gw:rl:${projectId}`;
}
