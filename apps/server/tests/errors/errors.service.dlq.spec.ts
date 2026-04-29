import { describe, expect, it, vi } from "vitest";
import { ErrorsService } from "../../src/errors/errors.service.js";
import type { IssuesService } from "../../src/errors/issues.service.js";
import type { DeadLetterService } from "../../src/dlq/dead-letter.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";
import { buildErrorEvent } from "../fixtures.js";

/**
 * ErrorsService DLQ 集成路径单测（T1.4.4 / ADR-0016 §5）
 *
 * 验证两条兜底路径：
 *  1. raw insert 失败 → 整批进 DLQ（stage=error-raw-insert）
 *  2. raw insert 成功 但 issues.upsertBatch 抛错 → 整批进 DLQ（stage=issues-upsert）
 *  3. 双成功路径 → 不进 DLQ
 *  4. db=null → 直接短路，不触发 DLQ
 */

function createDb(opts: {
  rawInsertThrows?: boolean;
  rawInsertReturn?: readonly { id: number }[];
}): DatabaseService {
  const returning = vi.fn(async () => {
    if (opts.rawInsertThrows) throw new Error("raw insert 爆炸");
    return opts.rawInsertReturn ?? [{ id: 1 }];
  });
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const db = { insert } as unknown as NonNullable<DatabaseService["db"]>;
  return { db } as unknown as DatabaseService;
}

function createIssues(throwErr: boolean): IssuesService {
  return {
    upsertBatch: vi.fn(async () => {
      if (throwErr) throw new Error("upsert 爆炸");
      return { inserted: 1, updated: 0, reopened: 0 };
    }),
  } as unknown as IssuesService;
}

function createDlq(): {
  svc: DeadLetterService;
  enqueueEvents: ReturnType<typeof vi.fn>;
} {
  const enqueueEvents = vi.fn(async () => 1);
  return {
    svc: { enqueueEvents } as unknown as DeadLetterService,
    enqueueEvents,
  };
}

describe("ErrorsService DLQ 兜底", () => {
  it("raw insert 抛错 → 整批进 DLQ（stage=error-raw-insert）→ 返回 0", async () => {
    const db = createDb({ rawInsertThrows: true });
    const issues = createIssues(false);
    const { svc: dlq, enqueueEvents } = createDlq();
    const service = new ErrorsService(db, issues, dlq);

    const events = [buildErrorEvent({ message: "A" })];
    const result = await service.saveBatch(events);

    expect(result).toBe(0);
    expect(enqueueEvents).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).toHaveBeenCalledWith(
      events,
      "error-raw-insert",
      "raw insert 爆炸",
    );
    expect(issues.upsertBatch).not.toHaveBeenCalled();
  });

  it("raw 成功 + issues 抛错 → 进 DLQ（stage=issues-upsert）→ 返回 raw 行数", async () => {
    const db = createDb({ rawInsertReturn: [{ id: 1 }, { id: 2 }] });
    const issues = createIssues(true);
    const { svc: dlq, enqueueEvents } = createDlq();
    const service = new ErrorsService(db, issues, dlq);

    const events = [
      buildErrorEvent({ message: "A" }),
      buildErrorEvent({
        eventId: "22222222-2222-4333-8444-555555555555",
        message: "B",
      }),
    ];
    const result = await service.saveBatch(events);

    expect(result).toBe(2);
    expect(enqueueEvents).toHaveBeenCalledWith(
      events,
      "issues-upsert",
      "upsert 爆炸",
    );
  });

  it("双成功 → 不触发 DLQ", async () => {
    const db = createDb({ rawInsertReturn: [{ id: 1 }] });
    const issues = createIssues(false);
    const { svc: dlq, enqueueEvents } = createDlq();
    const service = new ErrorsService(db, issues, dlq);

    const events = [buildErrorEvent()];
    await service.saveBatch(events);

    expect(enqueueEvents).not.toHaveBeenCalled();
  });

  it("db=null → 早短路，不触发 DLQ / issues", async () => {
    const db = { db: null } as unknown as DatabaseService;
    const issues = createIssues(false);
    const { svc: dlq, enqueueEvents } = createDlq();
    const service = new ErrorsService(db, issues, dlq);

    const result = await service.saveBatch([buildErrorEvent()]);

    expect(result).toBe(0);
    expect(enqueueEvents).not.toHaveBeenCalled();
    expect(issues.upsertBatch).not.toHaveBeenCalled();
  });

  it("空数组 → 0 且不触发任何兜底", async () => {
    const db = createDb({ rawInsertReturn: [] });
    const issues = createIssues(false);
    const { svc: dlq, enqueueEvents } = createDlq();
    const service = new ErrorsService(db, issues, dlq);

    const result = await service.saveBatch([]);

    expect(result).toBe(0);
    expect(enqueueEvents).not.toHaveBeenCalled();
  });
});
