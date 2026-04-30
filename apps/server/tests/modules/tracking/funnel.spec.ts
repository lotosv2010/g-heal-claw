import { describe, it, expect, vi } from "vitest";
import { TrackingService } from "../../../src/modules/tracking/tracking.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";

/**
 * TrackingService.aggregateFunnel 单测（ADR-0027 / TM.2.D.1）
 *
 * 定位：动态 N 步 CTE 行为单测，不验证 SQL 本身
 *  - stub `DatabaseService.db.execute()` 注入预制行
 *  - 校验：db=null 短路 / 2 步正常 / 8 步上限 / > 8 步拒绝 / < 2 步拒绝 / stepWindowMs<=0 拒绝
 *  - SQL 正确性由后续 Dockerized PG 集成测试负责
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(queue: readonly Record<string, unknown>[][]): {
  readonly service: DatabaseService;
  readonly calls: readonly unknown[];
} {
  let idx = 0;
  const calls: unknown[] = [];
  const executeSpy = vi.fn<ExecuteStub>(async (sqlArg) => {
    calls.push(sqlArg);
    const rows = queue[idx] ?? [];
    idx += 1;
    return rows;
  });
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, calls };
}

const BASE = {
  projectId: "proj_test",
  sinceMs: 1_700_000_000_000,
  untilMs: 1_700_003_600_000,
  stepWindowMs: 60 * 60 * 1000,
};

describe("TrackingService.aggregateFunnel / 防御校验", () => {
  const nullDb = { db: null } as unknown as DatabaseService;
  const svc = new TrackingService(nullDb);

  it("< 2 步：抛错", async () => {
    await expect(
      svc.aggregateFunnel({ ...BASE, steps: ["a"] }),
    ).rejects.toThrow(/步数必须在/);
  });

  it("空 steps：抛错", async () => {
    await expect(
      svc.aggregateFunnel({ ...BASE, steps: [] }),
    ).rejects.toThrow(/步数必须在/);
  });

  it("> 8 步：抛错", async () => {
    await expect(
      svc.aggregateFunnel({
        ...BASE,
        steps: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
      }),
    ).rejects.toThrow(/步数必须在/);
  });

  it("stepWindowMs <= 0：抛错", async () => {
    await expect(
      svc.aggregateFunnel({
        ...BASE,
        stepWindowMs: 0,
        steps: ["a", "b"],
      }),
    ).rejects.toThrow(/stepWindowMs 必须 > 0/);
  });
});

describe("TrackingService.aggregateFunnel / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("返回与步数等长的 0 填充数组", async () => {
    const svc = new TrackingService(nullDb);
    const out = await svc.aggregateFunnel({
      ...BASE,
      steps: ["view", "click", "submit"],
    });
    expect(out).toEqual([
      { index: 1, eventName: "view", users: 0 },
      { index: 2, eventName: "click", users: 0 },
      { index: 3, eventName: "submit", users: 0 },
    ]);
  });
});

describe("TrackingService.aggregateFunnel / 2 步正常", () => {
  it("读取 u1/u2 字段映射到 users", async () => {
    const { service, calls } = createStubDb([
      [{ u1: "120", u2: "45" }],
    ]);
    const svc = new TrackingService(service);
    const out = await svc.aggregateFunnel({
      ...BASE,
      steps: ["view_home", "click_cta"],
    });
    expect(out).toEqual([
      { index: 1, eventName: "view_home", users: 120 },
      { index: 2, eventName: "click_cta", users: 45 },
    ]);
    expect(calls).toHaveLength(1);
  });

  it("空结果行：全部返回 0", async () => {
    const { service } = createStubDb([[]]);
    const svc = new TrackingService(service);
    const out = await svc.aggregateFunnel({
      ...BASE,
      steps: ["a", "b"],
    });
    expect(out).toEqual([
      { index: 1, eventName: "a", users: 0 },
      { index: 2, eventName: "b", users: 0 },
    ]);
  });
});

describe("TrackingService.aggregateFunnel / 8 步上限", () => {
  it("恰好 8 步不抛错，输出长度一致", async () => {
    const { service } = createStubDb([
      [
        {
          u1: 100,
          u2: 80,
          u3: 60,
          u4: 40,
          u5: 20,
          u6: 10,
          u7: 5,
          u8: 1,
        },
      ],
    ]);
    const svc = new TrackingService(service);
    const steps = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
    const out = await svc.aggregateFunnel({ ...BASE, steps: [...steps] });
    expect(out.map((r) => r.users)).toEqual([100, 80, 60, 40, 20, 10, 5, 1]);
    expect(out[7]?.index).toBe(8);
    expect(out[7]?.eventName).toBe("h");
  });
});

describe("TrackingService.aggregateFunnel / 末步 0 不短路", () => {
  it("最后一步 users=0 时仍保留全部步长", async () => {
    const { service } = createStubDb([
      [{ u1: 100, u2: 50, u3: 0 }],
    ]);
    const svc = new TrackingService(service);
    const out = await svc.aggregateFunnel({
      ...BASE,
      steps: ["view", "click", "submit"],
    });
    expect(out).toHaveLength(3);
    expect(out[2]?.users).toBe(0);
    expect(out[2]?.eventName).toBe("submit");
  });
});
