import { describe, expect, it, vi } from "vitest";
import { IdempotencyService } from "../../src/gateway/idempotency.service.js";
import type { RedisService } from "../../src/shared/redis/redis.service.js";

/**
 * IdempotencyService 单测（T1.3.5）
 *
 * 策略：stub RedisService.client.pipeline().set().exec()；验证
 *  - Redis 不可用 → 放行全部
 *  - 全部 OK → first = 全量
 *  - 混合 OK/null → 精确拆分 first / duplicates
 *  - pipeline 抛错 → 放行全部（不破坏主链路）
 *  - 单条 reply 携带 error → 放行该条
 *  - 空输入 → 零结构
 */

interface PipelineStub {
  set: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

function mockEvent(eventId: string, projectId = "demo") {
  return {
    eventId,
    projectId,
    timestamp: 0,
    type: "custom_log" as const,
  };
}

function createStubRedis(
  execResult: Array<[Error | null, unknown]> | null,
  execThrows = false,
): { redis: RedisService; pipeline: PipelineStub } {
  const pipeline: PipelineStub = {
    set: vi.fn().mockReturnThis(),
    exec: execThrows
      ? vi.fn().mockRejectedValue(new Error("pipeline 爆炸"))
      : vi.fn().mockResolvedValue(execResult),
  };
  const client = { pipeline: vi.fn(() => pipeline) };
  const redis = { client } as unknown as RedisService;
  return { redis, pipeline };
}

describe("IdempotencyService / Redis 缺席", () => {
  it("client=null → 放行全部", async () => {
    const redis = { client: null } as unknown as RedisService;
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2")];
    const result = await svc.dedup(events);
    expect(result.first).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("空输入 → 零结构", async () => {
    const redis = { client: null } as unknown as RedisService;
    const svc = new IdempotencyService(redis);
    expect(await svc.dedup([])).toEqual({ first: [], duplicates: [] });
  });
});

describe("IdempotencyService / SETNX 分类", () => {
  it("全部 OK → first 全量", async () => {
    const { redis, pipeline } = createStubRedis([
      [null, "OK"],
      [null, "OK"],
    ]);
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2")];
    const result = await svc.dedup(events);
    expect(result.first).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
    expect(pipeline.set).toHaveBeenCalledTimes(2);
    expect(pipeline.set).toHaveBeenNthCalledWith(
      1,
      "gw:dedup:demo:e1",
      "1",
      "PX",
      expect.any(Number),
      "NX",
    );
  });

  it("混合 OK / null → 精确拆分", async () => {
    const { redis } = createStubRedis([
      [null, "OK"],
      [null, null],
      [null, "OK"],
    ]);
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2"), mockEvent("e3")];
    const result = await svc.dedup(events);
    expect(result.first.map((e) => e.eventId)).toEqual(["e1", "e3"]);
    expect(result.duplicates.map((e) => e.eventId)).toEqual(["e2"]);
  });

  it("单条 reply 携带 error → 该条放行（保留到 first）", async () => {
    const { redis } = createStubRedis([
      [new Error("single setnx err"), null],
      [null, "OK"],
    ]);
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2")];
    const result = await svc.dedup(events);
    expect(result.first.map((e) => e.eventId).sort()).toEqual(["e1", "e2"]);
    expect(result.duplicates).toHaveLength(0);
  });

  it("pipeline exec 抛错 → 放行全部（不抛错）", async () => {
    const { redis } = createStubRedis(null, true);
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2")];
    const result = await svc.dedup(events);
    expect(result.first).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("pipeline 返回长度不匹配 → 放行全部", async () => {
    const { redis } = createStubRedis([[null, "OK"]]);
    const svc = new IdempotencyService(redis);
    const events = [mockEvent("e1"), mockEvent("e2")];
    const result = await svc.dedup(events);
    expect(result.first).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("自定义 TTL → 传入 pipeline.set", async () => {
    const { redis, pipeline } = createStubRedis([[null, "OK"]]);
    const svc = new IdempotencyService(redis);
    await svc.dedup([mockEvent("e1")], 60_000);
    expect(pipeline.set).toHaveBeenCalledWith(
      "gw:dedup:demo:e1",
      "1",
      "PX",
      60_000,
      "NX",
    );
  });

  it("多项目 key 前缀隔离", async () => {
    const { redis, pipeline } = createStubRedis([
      [null, "OK"],
      [null, "OK"],
    ]);
    const svc = new IdempotencyService(redis);
    await svc.dedup([mockEvent("e1", "projA"), mockEvent("e1", "projB")]);
    expect(pipeline.set).toHaveBeenNthCalledWith(
      1,
      "gw:dedup:projA:e1",
      "1",
      "PX",
      expect.any(Number),
      "NX",
    );
    expect(pipeline.set).toHaveBeenNthCalledWith(
      2,
      "gw:dedup:projB:e1",
      "1",
      "PX",
      expect.any(Number),
      "NX",
    );
  });
});
