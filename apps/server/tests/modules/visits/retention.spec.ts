import { describe, it, expect, vi } from "vitest";
import {
  VisitsService,
  type RetentionParams,
} from "../../../src/modules/visits/visits.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";
import type { GeoIpService } from "../../../src/shared/geoip.service.js";

const mockGeoip = { lookup: () => ({ country: null, region: null, city: null }) } as unknown as GeoIpService;

/**
 * VisitsService.aggregateRetention 单测（ADR-0028 / TM.2.E.1）
 *
 * 定位：参数边界 + 行 → DTO 转换单测，不验证 SQL 本身
 *  - stub `DatabaseService.db.execute()` 注入预制行
 *  - 覆盖：db=null 短路 / 正常日 cohort / identity=user 切换 /
 *         cohortDays 越界 / returnDays 越界 / 时间窗不足
 *  - SQL 正确性由 Dockerized PG 集成测试负责
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// 14 天窗口足够覆盖 cohortDays=7 + returnDays=7
const BASE: RetentionParams = {
  projectId: "proj_test",
  sinceMs: Date.UTC(2026, 3, 16, 0, 0, 0),
  untilMs: Date.UTC(2026, 3, 16, 0, 0, 0) + 14 * ONE_DAY_MS,
  cohortDays: 7,
  returnDays: 7,
  identity: "session",
};

describe("VisitsService.aggregateRetention / 防御校验", () => {
  const nullDb = { db: null } as unknown as DatabaseService;
  const svc = new VisitsService(nullDb, mockGeoip);

  it("cohortDays 越界 (0) → 抛错", async () => {
    await expect(
      svc.aggregateRetention({ ...BASE, cohortDays: 0 }),
    ).rejects.toThrow(/cohortDays/);
  });

  it("returnDays 越界 (31) → 抛错", async () => {
    // 同步放大时间窗口避免被「时间窗不足」先拦截
    await expect(
      svc.aggregateRetention({
        ...BASE,
        returnDays: 31,
        untilMs: BASE.sinceMs + 100 * ONE_DAY_MS,
      }),
    ).rejects.toThrow(/returnDays/);
  });

  it("时间窗不足 (cohortDays + returnDays 超出) → 抛错", async () => {
    await expect(
      svc.aggregateRetention({
        ...BASE,
        untilMs: BASE.sinceMs + 3 * ONE_DAY_MS, // 只有 3 天，远不足 14 天
      }),
    ).rejects.toThrow(/时间窗口/);
  });
});

describe("VisitsService.aggregateRetention / db=null 短路", () => {
  it("返回空数组", async () => {
    const svc = new VisitsService(
      { db: null } as unknown as DatabaseService,
      mockGeoip,
    );
    const out = await svc.aggregateRetention({ ...BASE });
    expect(out).toEqual([]);
  });
});

describe("VisitsService.aggregateRetention / 正常日 cohort", () => {
  it("行 → DTO 转换正确（cohort_day + day_offset + retained）", async () => {
    const { service, calls } = createStubDb([
      [
        {
          cohort_day: new Date("2026-04-16T00:00:00Z"),
          cohort_size: "10",
          day_offset: 0,
          retained: "10",
        },
        {
          cohort_day: new Date("2026-04-16T00:00:00Z"),
          cohort_size: "10",
          day_offset: 1,
          retained: "4",
        },
        {
          // PG TO_CHAR 可能返回 ISO 字符串
          cohort_day: "2026-04-17T00:00:00.000Z",
          cohort_size: 8,
          day_offset: 0,
          retained: 8,
        },
      ],
    ]);
    const svc = new VisitsService(service, mockGeoip);
    const out = await svc.aggregateRetention({ ...BASE });
    expect(out).toEqual([
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 0,
        retained: 10,
      },
      {
        cohortDay: "2026-04-16",
        cohortSize: 10,
        dayOffset: 1,
        retained: 4,
      },
      {
        cohortDay: "2026-04-17",
        cohortSize: 8,
        dayOffset: 0,
        retained: 8,
      },
    ]);
    expect(calls).toHaveLength(1);
  });
});

describe("VisitsService.aggregateRetention / identity=user 切换", () => {
  it("identity=user 时使用 COALESCE(user_id, session_id) 表达式", async () => {
    const { service, calls } = createStubDb([[]]);
    const svc = new VisitsService(service, mockGeoip);
    await svc.aggregateRetention({ ...BASE, identity: "user" });
    // 无法直接 assert drizzle sql 节点，退而验证 SQL 结构字符串中包含 COALESCE
    // drizzle `sql` 节点有 queryChunks 字段，纯 identity switch 的结果通过 raw 进入 chunks
    const chunk = calls[0] as { queryChunks?: unknown[] };
    expect(JSON.stringify(chunk.queryChunks ?? [])).toContain(
      "COALESCE(user_id, session_id)",
    );
  });

  it("identity=session 时仅引用 session_id", async () => {
    const { service, calls } = createStubDb([[]]);
    const svc = new VisitsService(service, mockGeoip);
    await svc.aggregateRetention({ ...BASE, identity: "session" });
    const chunk = calls[0] as { queryChunks?: unknown[] };
    const serialized = JSON.stringify(chunk.queryChunks ?? []);
    expect(serialized).toContain("session_id");
    expect(serialized).not.toContain("COALESCE(user_id, session_id)");
  });
});
