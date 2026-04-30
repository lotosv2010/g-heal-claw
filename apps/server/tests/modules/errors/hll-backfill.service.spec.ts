import { describe, expect, it, vi } from "vitest";
import { IssueHllBackfillService } from "../../../src/modules/errors/hll-backfill.service.js";
import type { IssueUserHllService } from "../../../src/modules/errors/hll.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";
import type { ServerEnv } from "../../../src/config/env.js";

/**
 * IssueHllBackfillService 单测（T1.4.3）
 *
 * 覆盖：
 *  - db=null → 立即返回 {scanned:0,updated:0}
 *  - HLL 估算 null（Redis 缺席）→ 跳过，不 UPDATE
 *  - 估算 > 现值 → UPDATE 计数
 *  - 估算 <= 现值 → 不 UPDATE（HLL 只增不减，避免回退）
 *  - UPDATE 抛错 → 捕获，累计不加
 */

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "test",
    ISSUE_HLL_BACKFILL_INTERVAL_MS: 0,
    ISSUE_HLL_BACKFILL_BATCH: 500,
    ...overrides,
  } as unknown as ServerEnv;
}

function createDb(
  rows: ReadonlyArray<{
    id: string;
    project_id: string;
    fingerprint: string;
    impacted_sessions: number;
  }>,
  opts: { updateThrows?: boolean } = {},
): {
  db: DatabaseService;
  execute: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn(async (_query: unknown) => {
    // 第一次调用返回行；后续（UPDATE）返回空 / 抛错
    if (execute.mock.calls.length === 1) return rows;
    if (opts.updateThrows) throw new Error("update 爆炸");
    return [];
  });
  const inner = { execute } as unknown as NonNullable<DatabaseService["db"]>;
  return { db: { db: inner } as unknown as DatabaseService, execute };
}

function createHll(
  estimates: ReadonlyArray<number | null>,
): IssueUserHllService {
  let i = 0;
  return {
    pfAdd: vi.fn(async () => undefined),
    pfCount: vi.fn(async () => estimates[i++] ?? null),
  } as unknown as IssueUserHllService;
}

describe("IssueHllBackfillService", () => {
  it("db=null → 早返回 {scanned:0, updated:0}", async () => {
    const svc = new IssueHllBackfillService(
      { db: null } as unknown as DatabaseService,
      createHll([]),
      buildEnv(),
    );
    const result = await svc.tick();
    expect(result).toEqual({ scanned: 0, updated: 0 });
  });

  it("pfCount=null（Redis 缺席）→ 跳过，不调用 UPDATE", async () => {
    const { db, execute } = createDb([
      { id: "iss_1", project_id: "p", fingerprint: "fp1", impacted_sessions: 5 },
    ]);
    const svc = new IssueHllBackfillService(db, createHll([null]), buildEnv());
    const result = await svc.tick();
    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1); // 仅 SELECT
  });

  it("估算 > 现值 → UPDATE 计 1 更新", async () => {
    const { db, execute } = createDb([
      { id: "iss_1", project_id: "p", fingerprint: "fp1", impacted_sessions: 5 },
    ]);
    const svc = new IssueHllBackfillService(db, createHll([42]), buildEnv());
    const result = await svc.tick();
    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(execute).toHaveBeenCalledTimes(2); // SELECT + UPDATE
  });

  it("估算 <= 现值 → 不 UPDATE（避免回退）", async () => {
    const { db, execute } = createDb([
      { id: "iss_1", project_id: "p", fingerprint: "fp1", impacted_sessions: 50 },
      { id: "iss_2", project_id: "p", fingerprint: "fp2", impacted_sessions: 50 },
    ]);
    const svc = new IssueHllBackfillService(db, createHll([30, 50]), buildEnv());
    const result = await svc.tick();
    expect(result).toEqual({ scanned: 2, updated: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("UPDATE 抛错 → 捕获，updated 不计入", async () => {
    const { db } = createDb(
      [{ id: "iss_1", project_id: "p", fingerprint: "fp", impacted_sessions: 1 }],
      { updateThrows: true },
    );
    const svc = new IssueHllBackfillService(db, createHll([999]), buildEnv());
    const result = await svc.tick();
    expect(result).toEqual({ scanned: 1, updated: 0 });
  });

  it("并发 tick 再入：running 保护短路", async () => {
    const { db, execute } = createDb([
      { id: "iss_1", project_id: "p", fingerprint: "fp", impacted_sessions: 1 },
    ]);
    // 让第一次 execute 挂起
    let resolveFirst: (rows: unknown[]) => void = () => {};
    const firstPromise = new Promise<unknown[]>((resolve) => {
      resolveFirst = resolve;
    });
    execute.mockImplementationOnce(async () => firstPromise);

    const svc = new IssueHllBackfillService(db, createHll([999]), buildEnv());
    const inFlight = svc.tick();
    const concurrent = await svc.tick();
    expect(concurrent).toEqual({ scanned: 0, updated: 0 });
    resolveFirst([
      { id: "iss_1", project_id: "p", fingerprint: "fp", impacted_sessions: 1 },
    ]);
    await inFlight;
  });
});
