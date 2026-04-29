import { describe, expect, it, vi } from "vitest";
import { RateLimitService } from "../../src/gateway/rate-limit.service.js";
import type { RedisService } from "../../src/shared/redis/redis.service.js";
import type { ServerEnv } from "../../src/config/env.js";

/**
 * RateLimitService 单测（T1.3.3 / ADR-0016 §4）
 *
 * 策略：stub Redis client.script() + evalsha()；验证
 *  - Redis 缺席 → 放行（默认 remaining=capacity）
 *  - Lua 返回 [1, N, 0] → allowed=true，remaining 精确透传
 *  - Lua 返回 [0, 0, retryMs] → allowed=false + retryAfterMs 透传
 *  - 首次调用加载脚本，后续复用 sha
 *  - evalsha 抛错 → 放行（降级，不破坏主链路）
 */

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    GATEWAY_RATE_LIMIT_PER_SEC: 100,
    GATEWAY_RATE_LIMIT_BURST: 200,
    ...overrides,
  } as unknown as ServerEnv;
}

function createStubRedis(opts: {
  scriptReturn?: unknown;
  evalReturn?: unknown;
  evalThrows?: boolean;
}): {
  redis: RedisService;
  script: ReturnType<typeof vi.fn>;
  evalsha: ReturnType<typeof vi.fn>;
} {
  const script = vi.fn(async () => opts.scriptReturn ?? "sha-abc");
  const evalsha = opts.evalThrows
    ? vi.fn(async () => {
        throw new Error("eval 爆炸");
      })
    : vi.fn(async () => opts.evalReturn ?? [1, 199, 0]);
  const client = { script, evalsha };
  const redis = { client } as unknown as RedisService;
  return { redis, script, evalsha };
}

describe("RateLimitService / Redis 缺席", () => {
  it("client=null → 放行，remaining=capacity", async () => {
    const redis = { client: null } as unknown as RedisService;
    const svc = new RateLimitService(redis, buildEnv());
    const result = await svc.consume("proj1");
    expect(result).toEqual({ allowed: true, remaining: 200, retryAfterMs: 0 });
  });
});

describe("RateLimitService / Lua 返回", () => {
  it("allowed=1 → 透传 remaining", async () => {
    const { redis } = createStubRedis({ evalReturn: [1, 199, 0] });
    const svc = new RateLimitService(redis, buildEnv());
    const result = await svc.consume("proj1");
    expect(result).toEqual({ allowed: true, remaining: 199, retryAfterMs: 0 });
  });

  it("allowed=0 → retryAfterMs 透传", async () => {
    const { redis } = createStubRedis({ evalReturn: [0, 0, 430] });
    const svc = new RateLimitService(redis, buildEnv());
    const result = await svc.consume("proj1");
    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterMs: 430 });
  });

  it("首次加载脚本，后续复用 sha（只 LOAD 一次）", async () => {
    const { redis, script, evalsha } = createStubRedis({
      evalReturn: [1, 199, 0],
    });
    const svc = new RateLimitService(redis, buildEnv());
    await svc.consume("proj1");
    await svc.consume("proj1");
    await svc.consume("proj2");
    expect(script).toHaveBeenCalledTimes(1);
    expect(evalsha).toHaveBeenCalledTimes(3);
  });

  it("evalsha 抛错 → 放行（降级日志）", async () => {
    const { redis } = createStubRedis({ evalThrows: true });
    const svc = new RateLimitService(redis, buildEnv());
    const result = await svc.consume("proj1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(200);
  });

  it("传参精确：capacity / refill_rate / requested 来自 env 与调用参数", async () => {
    const { redis, evalsha } = createStubRedis({ evalReturn: [1, 5, 0] });
    const svc = new RateLimitService(
      redis,
      buildEnv({
        GATEWAY_RATE_LIMIT_BURST: 10,
        GATEWAY_RATE_LIMIT_PER_SEC: 5,
      }),
    );
    await svc.consume("proj1", 2);
    expect(evalsha).toHaveBeenCalledWith(
      "sha-abc",
      1,
      "gw:rl:proj1",
      "10", // capacity
      "5", // refill_per_sec
      expect.any(String), // now_ms
      "2", // requested
    );
  });
});
