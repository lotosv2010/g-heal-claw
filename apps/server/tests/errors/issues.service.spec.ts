import { describe, expect, it, vi } from "vitest";
import { IssuesService } from "../../src/errors/issues.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";
import { buildErrorEvent } from "../fixtures.js";

/**
 * IssuesService 单测（T1.4.1 / ADR-0016 §3）
 *
 * 策略：stub DatabaseService.db.execute() 按调用次数返回预制行
 *  - 验证聚合逻辑（批内合并同指纹 + session 去重）
 *  - 验证 inserted / updated / reopened 三态分类
 *  - 验证 db=null 短路 + resolve / reopen 幂等
 *
 * 不测 SQL 本身：UPSERT ON CONFLICT 的正确性留给 Dockerized PG 集成测试。
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(queue: readonly Record<string, unknown>[][]): {
  readonly service: DatabaseService;
  readonly executeSpy: ReturnType<typeof vi.fn>;
} {
  let idx = 0;
  const executeSpy = vi.fn<ExecuteStub>(async () => {
    const rows = queue[idx] ?? [];
    idx += 1;
    return rows;
  });
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, executeSpy };
}

describe("IssuesService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("upsertBatch 空数组 → 零结构", async () => {
    const svc = new IssuesService(nullDb);
    expect(await svc.upsertBatch([])).toEqual({
      inserted: 0,
      updated: 0,
      reopened: 0,
    });
  });

  it("upsertBatch 有事件但 db=null → 零结构（不抛错）", async () => {
    const svc = new IssuesService(nullDb);
    expect(await svc.upsertBatch([buildErrorEvent()])).toEqual({
      inserted: 0,
      updated: 0,
      reopened: 0,
    });
  });

  it("resolve / reopen 短路返回 false", async () => {
    const svc = new IssuesService(nullDb);
    expect(await svc.resolve("iss_x")).toBe(false);
    expect(await svc.reopen("iss_x")).toBe(false);
  });
});

describe("IssuesService / 批内合并", () => {
  it("同 projectId + 同指纹 → 合并为 1 次 UPSERT", async () => {
    // 2 条同 subType+message 的事件，预期仅 1 次 execute 调用
    const { service, executeSpy } = createStubDb([
      [{ id: "iss_1", pre_status: null, status: "open", event_count: 2 }],
    ]);
    const svc = new IssuesService(service);
    const ev1 = buildErrorEvent({ message: "Boom" });
    const ev2 = buildErrorEvent({
      eventId: "22222222-2222-4333-8444-555555555555",
      message: "Boom",
    });
    const result = await svc.upsertBatch([ev1, ev2]);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ inserted: 1, updated: 0, reopened: 0 });
  });

  it("不同指纹 → 多次 UPSERT", async () => {
    const { service, executeSpy } = createStubDb([
      [{ id: "iss_1", pre_status: null, status: "open", event_count: 1 }],
      [{ id: "iss_2", pre_status: null, status: "open", event_count: 1 }],
    ]);
    const svc = new IssuesService(service);
    const jsErr = buildErrorEvent({ message: "A", subType: "js" });
    const promiseErr = buildErrorEvent({
      eventId: "22222222-2222-4333-8444-555555555555",
      message: "B",
      subType: "promise",
    });
    const result = await svc.upsertBatch([jsErr, promiseErr]);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ inserted: 2, updated: 0, reopened: 0 });
  });
});

describe("IssuesService / 三态分类", () => {
  it("inserted：pre_status = null", async () => {
    const { service } = createStubDb([
      [{ id: "iss_1", pre_status: null, status: "open", event_count: 1 }],
    ]);
    const svc = new IssuesService(service);
    const r = await svc.upsertBatch([buildErrorEvent()]);
    expect(r).toMatchObject({ inserted: 1, updated: 0, reopened: 0 });
  });

  it("updated：pre_status = open / status = open", async () => {
    const { service } = createStubDb([
      [{ id: "iss_1", pre_status: "open", status: "open", event_count: 5 }],
    ]);
    const svc = new IssuesService(service);
    const r = await svc.upsertBatch([buildErrorEvent()]);
    expect(r).toMatchObject({ inserted: 0, updated: 1, reopened: 0 });
  });

  it("reopened：pre_status = resolved 且 status 回到 open", async () => {
    const { service } = createStubDb([
      [
        {
          id: "iss_1",
          pre_status: "resolved",
          status: "open",
          event_count: 6,
        },
      ],
    ]);
    const svc = new IssuesService(service);
    const r = await svc.upsertBatch([buildErrorEvent()]);
    expect(r).toMatchObject({ inserted: 0, updated: 0, reopened: 1 });
  });
});

describe("IssuesService / 状态机", () => {
  it("resolve 命中（row 返回）→ true", async () => {
    const { service } = createStubDb([[{ id: "iss_1" }]]);
    const svc = new IssuesService(service);
    expect(await svc.resolve("iss_1")).toBe(true);
  });

  it("resolve 未命中（空 rows）→ false", async () => {
    const { service } = createStubDb([[]]);
    const svc = new IssuesService(service);
    expect(await svc.resolve("iss_missing")).toBe(false);
  });

  it("reopen 命中 → true", async () => {
    const { service } = createStubDb([[{ id: "iss_1" }]]);
    const svc = new IssuesService(service);
    expect(await svc.reopen("iss_1")).toBe(true);
  });
});
