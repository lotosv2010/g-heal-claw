import { describe, expect, it, vi } from "vitest";
import { DeadLetterService } from "../../src/dlq/dead-letter.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";
import { buildErrorEvent } from "../fixtures.js";

/**
 * DeadLetterService 单测（T1.4.4 / ADR-0016 §5）
 *
 * 覆盖：
 *  - db=null 短路返回 0
 *  - 空输入 → 0
 *  - 全部成功 → 计数正确
 *  - 单条失败不影响其他条目
 *  - enqueueEvents 便捷方法把事件打成 DLQ 条目
 */

function createStubDb(failIndices: readonly number[] = []): {
  readonly service: DatabaseService;
  readonly executeSpy: ReturnType<typeof vi.fn>;
} {
  let idx = 0;
  const executeSpy = vi.fn(async () => {
    const current = idx;
    idx += 1;
    if (failIndices.includes(current)) {
      throw new Error(`stub insert #${current} failed`);
    }
    return [] as never[];
  });
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, executeSpy };
}

describe("DeadLetterService / 短路", () => {
  it("db=null → 空输入 → 0", async () => {
    const nullDb = { db: null } as unknown as DatabaseService;
    const svc = new DeadLetterService(nullDb);
    expect(await svc.enqueue([])).toBe(0);
  });

  it("db=null → 有输入 → 仍返回 0（静默降级，不抛错）", async () => {
    const nullDb = { db: null } as unknown as DatabaseService;
    const svc = new DeadLetterService(nullDb);
    expect(
      await svc.enqueue([
        {
          eventId: "e1",
          projectId: "p1",
          eventType: "error",
          stage: "error-raw-insert",
          reason: "boom",
          payload: {},
        },
      ]),
    ).toBe(0);
  });
});

describe("DeadLetterService / 批量入库", () => {
  it("全部成功 → 返回 3", async () => {
    const { service, executeSpy } = createStubDb();
    const svc = new DeadLetterService(service);
    const inserted = await svc.enqueue([
      buildEntry("e1"),
      buildEntry("e2"),
      buildEntry("e3"),
    ]);
    expect(inserted).toBe(3);
    expect(executeSpy).toHaveBeenCalledTimes(3);
  });

  it("中间条目失败 → 其余条目仍入库", async () => {
    const { service, executeSpy } = createStubDb([1]);
    const svc = new DeadLetterService(service);
    const inserted = await svc.enqueue([
      buildEntry("e1"),
      buildEntry("e2"),
      buildEntry("e3"),
    ]);
    expect(inserted).toBe(2);
    expect(executeSpy).toHaveBeenCalledTimes(3);
  });
});

describe("DeadLetterService / enqueueEvents", () => {
  it("把事件打成 DLQ 条目，stage / reason 复用", async () => {
    const { service, executeSpy } = createStubDb();
    const svc = new DeadLetterService(service);
    const ev1 = buildErrorEvent({ message: "A" });
    const ev2 = buildErrorEvent({
      eventId: "22222222-2222-4333-8444-555555555555",
      message: "B",
    });
    const inserted = await svc.enqueueEvents(
      [ev1, ev2],
      "issues-upsert",
      "timeout",
    );
    expect(inserted).toBe(2);
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });
});

function buildEntry(eventId: string) {
  return {
    eventId,
    projectId: "demo",
    eventType: "error" as const,
    stage: "error-raw-insert" as const,
    reason: "test reason",
    payload: { foo: "bar" },
  };
}
