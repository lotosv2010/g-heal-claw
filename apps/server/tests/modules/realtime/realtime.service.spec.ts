import { describe, expect, it, vi } from "vitest";
import { RealtimeService } from "../../../src/modules/realtime/realtime.service.js";
import type { RedisService } from "../../../src/shared/redis/redis.service.js";
import type { ServerEnv } from "../../../src/config/env.js";
import type {
  RealtimeErrorPayload,
  RealtimePayload,
} from "../../../src/modules/realtime/topics.js";

/**
 * RealtimeService 单测（ADR-0030 §3 / §4 / TM.2.C.3）
 *
 * Redis 行为通过 stub 控制；NODE_ENV=test 情况下 psubscribe 不会真连。
 */

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "test",
    REDIS_URL: "redis://localhost:6379",
    REALTIME_SAMPLE_RATE: 1,
    REALTIME_STREAM_MAXLEN: 1000,
    REALTIME_MAX_CONN_PER_PROJECT: 3,
    ...overrides,
  } as unknown as ServerEnv;
}

function buildRedisStub(opts: {
  xaddThrows?: boolean;
  publishThrows?: boolean;
  xrangeReturns?: Array<[string, string[]]>;
} = {}): {
  redis: RedisService;
  xaddMock: ReturnType<typeof vi.fn>;
  publishMock: ReturnType<typeof vi.fn>;
} {
  const xaddMock = vi.fn(async () => {
    if (opts.xaddThrows) throw new Error("xadd fail");
    return "1730000000000-0";
  });
  const publishMock = vi.fn(async () => {
    if (opts.publishThrows) throw new Error("publish fail");
    return 1;
  });
  const xrange = vi.fn(async () => opts.xrangeReturns ?? []);
  return {
    redis: {
      client: {
        xadd: xaddMock,
        publish: publishMock,
        xrange,
      },
    } as unknown as RedisService,
    xaddMock,
    publishMock,
  };
}

const errorPayload: RealtimePayload = {
  topic: "error",
  ts: 1_730_000_000_000,
  subType: "js",
  messageHead: "Oops",
  url: "https://x.test/a",
} satisfies { topic: "error" } & RealtimeErrorPayload;

describe("RealtimeService.publish", () => {
  it("XADD + PUBLISH 正常写入", async () => {
    const env = buildEnv();
    const { redis, xaddMock, publishMock } = buildRedisStub();
    const service = new RealtimeService(env, redis);
    await service.publish("proj_1", errorPayload);
    expect(xaddMock).toHaveBeenCalledOnce();
    expect(publishMock).toHaveBeenCalledWith(
      "rt:proj_1:error",
      JSON.stringify(errorPayload),
    );
  });

  it("采样率 0 时不写入", async () => {
    const env = buildEnv({ REALTIME_SAMPLE_RATE: 0 });
    const { redis, xaddMock, publishMock } = buildRedisStub();
    const service = new RealtimeService(env, redis);
    await service.publish("proj_1", errorPayload);
    expect(xaddMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("Redis 未建连（client=null）安全 no-op", async () => {
    const service = new RealtimeService(buildEnv(), {
      client: null,
    } as unknown as RedisService);
    await expect(service.publish("proj_1", errorPayload)).resolves.toBeUndefined();
  });

  it("XADD 抛错时吞异常不回滚入库", async () => {
    const { redis } = buildRedisStub({ xaddThrows: true });
    const service = new RealtimeService(buildEnv(), redis);
    await expect(service.publish("proj_1", errorPayload)).resolves.toBeUndefined();
  });
});

describe("RealtimeService.subscribe", () => {
  it("首次订阅创建 bucket，连接计数递增", () => {
    const { redis } = buildRedisStub();
    const service = new RealtimeService(buildEnv(), redis);
    const off = service.subscribe("proj_1", ["error"], () => {});
    expect(off).toBeInstanceOf(Function);
    expect(service.connectionCount("proj_1")).toBe(1);
  });

  it("超出 MAX_CONN_PER_PROJECT 返回 null", () => {
    const { redis } = buildRedisStub();
    const env = buildEnv({ REALTIME_MAX_CONN_PER_PROJECT: 2 });
    const service = new RealtimeService(env, redis);
    service.subscribe("p", [], () => {});
    service.subscribe("p", [], () => {});
    const third = service.subscribe("p", [], () => {});
    expect(third).toBeNull();
  });

  it("取消订阅释放连接计数", () => {
    const { redis } = buildRedisStub();
    const service = new RealtimeService(buildEnv(), redis);
    const off = service.subscribe("p", [], () => {});
    off?.();
    expect(service.connectionCount("p")).toBe(0);
  });

  it("topic 白名单过滤非匹配事件", () => {
    const { redis } = buildRedisStub();
    const service = new RealtimeService(buildEnv(), redis);
    const received: RealtimePayload[] = [];
    service.subscribe("p", ["error"], (_id, payload) => {
      received.push(payload);
    });
    // 使用私有 dispatch 走正常路径：通过手工触发 pmessage 回调语义
    // 这里直接调用内部 dispatch（通过 any 桥）验证过滤
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).dispatch("rt:p:error", JSON.stringify(errorPayload));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).dispatch(
      "rt:p:api",
      JSON.stringify({
        topic: "api",
        ts: 1,
        method: "GET",
        status: 200,
        durationMs: 10,
      }),
    );
    expect(received).toHaveLength(1);
    expect(received[0]?.topic).toBe("error");
  });
});

describe("RealtimeService.replayAfter", () => {
  it("空 stream 返回空数组", async () => {
    const { redis } = buildRedisStub({ xrangeReturns: [] });
    const service = new RealtimeService(buildEnv(), redis);
    const items = await service.replayAfter("p", "0", ["error"]);
    expect(items).toEqual([]);
  });

  it("过滤掉非订阅 topic 的条目", async () => {
    const { redis } = buildRedisStub({
      xrangeReturns: [
        [
          "1-0",
          ["data", JSON.stringify(errorPayload)],
        ],
        [
          "2-0",
          [
            "data",
            JSON.stringify({
              topic: "api",
              ts: 2,
              method: "GET",
              status: 200,
              durationMs: 10,
            }),
          ],
        ],
      ],
    });
    const service = new RealtimeService(buildEnv(), redis);
    const items = await service.replayAfter("p", "0", ["error"]);
    expect(items).toHaveLength(1);
    expect(items[0]?.payload.topic).toBe("error");
    expect(items[0]?.id).toBe("1-0");
  });
});
