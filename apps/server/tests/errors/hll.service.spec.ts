import { describe, expect, it, vi } from "vitest";
import { IssueUserHllService } from "../../src/errors/hll.service.js";
import type { RedisService } from "../../src/shared/redis/redis.service.js";
import { buildErrorEvent } from "../fixtures.js";

/**
 * IssueUserHllService 单测（T1.4.3 / ADR-0016 §3.4）
 *
 * 覆盖：
 *  - Redis 缺席 → pfAdd 静默 / pfCount 返回 null
 *  - 批内归并：同指纹事件只 pfadd 一次，但 sessionId 集合合并
 *  - 多指纹分开：不同 subType / message 构造不同 key
 *  - pipeline 异常 → 吞错，不抛
 *  - pfCount 正常路径
 */

function createRedis(opts: {
  execReturn?: unknown;
  execThrows?: boolean;
  pfcountReturn?: unknown;
  pfcountThrows?: boolean;
}): {
  redis: RedisService;
  pfadd: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  pfcount: ReturnType<typeof vi.fn>;
} {
  const pfadd = vi.fn();
  const expire = vi.fn();
  const exec = opts.execThrows
    ? vi.fn(async () => {
        throw new Error("pipeline 爆炸");
      })
    : vi.fn(async () => opts.execReturn ?? [[null, 1]]);
  const pipeline = vi.fn(() => ({
    pfadd: (...args: unknown[]) => {
      pfadd(...args);
      return { pfadd, expire, exec };
    },
    expire: (...args: unknown[]) => {
      expire(...args);
      return { pfadd, expire, exec };
    },
    exec,
  }));
  const pfcount = opts.pfcountThrows
    ? vi.fn(async () => {
        throw new Error("pfcount 爆炸");
      })
    : vi.fn(async () => opts.pfcountReturn ?? 42);

  const client = { pipeline, pfcount };
  const redis = { client } as unknown as RedisService;
  return { redis, pfadd, expire, pfcount };
}

describe("IssueUserHllService / Redis 缺席", () => {
  it("client=null → pfAdd 静默 / pfCount 返回 null", async () => {
    const redis = { client: null } as unknown as RedisService;
    const svc = new IssueUserHllService(redis);
    await expect(
      svc.pfAdd([buildErrorEvent()]),
    ).resolves.toBeUndefined();
    await expect(svc.pfCount("demo", "fp")).resolves.toBeNull();
  });
});

describe("IssueUserHllService / pfAdd", () => {
  it("空数组 → 立即返回，不触碰 pipeline", async () => {
    const { redis, pfadd } = createRedis({});
    const svc = new IssueUserHllService(redis);
    await svc.pfAdd([]);
    expect(pfadd).not.toHaveBeenCalled();
  });

  it("同一批次同指纹多事件 → pfadd 调用一次（批内归并），session 合并", async () => {
    const { redis, pfadd, expire } = createRedis({});
    const svc = new IssueUserHllService(redis);
    const events = [
      buildErrorEvent({ message: "boom", sessionId: "s1" }),
      buildErrorEvent({ message: "boom", sessionId: "s2" }),
      buildErrorEvent({ message: "boom", sessionId: "s1" }), // 去重
    ];
    await svc.pfAdd(events);
    expect(pfadd).toHaveBeenCalledTimes(1);
    const call = pfadd.mock.calls[0]!;
    expect(String(call[0])).toContain("iss:hll:demo:");
    const sessions = call.slice(1).sort();
    expect(sessions).toEqual(["s1", "s2"]);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("不同 subType 产生不同 key", async () => {
    const { redis, pfadd } = createRedis({});
    const svc = new IssueUserHllService(redis);
    await svc.pfAdd([
      buildErrorEvent({ subType: "js", message: "A", sessionId: "s1" }),
      buildErrorEvent({
        subType: "promise",
        message: "A",
        sessionId: "s1",
        eventId: "11111111-2222-4333-8444-666666666667",
      }),
    ]);
    expect(pfadd).toHaveBeenCalledTimes(2);
    const key1 = String(pfadd.mock.calls[0]![0]);
    const key2 = String(pfadd.mock.calls[1]![0]);
    expect(key1).not.toBe(key2);
  });

  it("pipeline 抛错 → 吞错不向上传播", async () => {
    const { redis } = createRedis({ execThrows: true });
    const svc = new IssueUserHllService(redis);
    await expect(
      svc.pfAdd([buildErrorEvent()]),
    ).resolves.toBeUndefined();
  });

  it("事件无 sessionId 则跳过（空 Set 不 pfadd）", async () => {
    const { redis, pfadd } = createRedis({});
    const svc = new IssueUserHllService(redis);
    await svc.pfAdd([
      buildErrorEvent({ sessionId: "" }),
    ]);
    expect(pfadd).not.toHaveBeenCalled();
  });
});

describe("IssueUserHllService / pfCount", () => {
  it("正常返回数值", async () => {
    const { redis } = createRedis({ pfcountReturn: 123 });
    const svc = new IssueUserHllService(redis);
    await expect(svc.pfCount("demo", "fp")).resolves.toBe(123);
  });

  it("pfcount 抛错 → 返回 null", async () => {
    const { redis } = createRedis({ pfcountThrows: true });
    const svc = new IssueUserHllService(redis);
    await expect(svc.pfCount("demo", "fp")).resolves.toBeNull();
  });
});
