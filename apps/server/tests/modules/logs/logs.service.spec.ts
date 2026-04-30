import { describe, it, expect, vi } from "vitest";
import type { CustomLog } from "@g-heal-claw/shared";
import { LogsService } from "../../../src/modules/logs/logs.service.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";

/**
 * LogsService 单测（ADR-0023 §4 / TM.1.C.3）
 *
 * 覆盖：db=null 短路 / summary errorRatio / 3 固定 level 分桶 / trend 三折线 / topMessages
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

const WINDOW = {
  projectId: "proj_test",
  sinceMs: 1_700_000_000_000,
  untilMs: 1_700_000_003_600_000,
};

describe("LogsService / db=null 短路", () => {
  const nullDb = { db: null } as unknown as DatabaseService;

  it("saveBatch 空数组返回 0", async () => {
    const svc = new LogsService(nullDb);
    expect(await svc.saveBatch([])).toBe(0);
  });

  it("saveBatch db=null 返回 0", async () => {
    const svc = new LogsService(nullDb);
    expect(await svc.saveBatch([buildCustomLog()])).toBe(0);
  });

  it("countForProject db=null 返回 0", async () => {
    const svc = new LogsService(nullDb);
    expect(await svc.countForProject("p")).toBe(0);
  });

  it("aggregateSummary db=null 返回零填充", async () => {
    const svc = new LogsService(nullDb);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      errorRatio: 0,
    });
  });

  it("aggregateLevelBuckets db=null 返回 3 级固定占位", async () => {
    const svc = new LogsService(nullDb);
    const out = await svc.aggregateLevelBuckets(WINDOW);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.level)).toEqual(["info", "warn", "error"]);
    for (const r of out) expect(r.count).toBe(0);
  });

  it("aggregateTrend / aggregateTopMessages db=null 返回空数组", async () => {
    const svc = new LogsService(nullDb);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([]);
    expect(await svc.aggregateTopMessages(WINDOW, 10)).toEqual([]);
  });
});

describe("LogsService / aggregateSummary", () => {
  it("errorRatio = errors / total", async () => {
    const { service } = createStubDb([
      [{ total: "200", errors: "40", warns: "60", infos: "100" }],
    ]);
    const svc = new LogsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalLogs: 200,
      errorCount: 40,
      warnCount: 60,
      infoCount: 100,
      errorRatio: 0.2,
    });
  });

  it("total=0 → errorRatio=0 不除零", async () => {
    const { service } = createStubDb([
      [{ total: "0", errors: "0", warns: "0", infos: "0" }],
    ]);
    const svc = new LogsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      errorRatio: 0,
    });
  });

  it("空结果集 → 零填充", async () => {
    const { service } = createStubDb([[]]);
    const svc = new LogsService(service);
    expect(await svc.aggregateSummary(WINDOW)).toEqual({
      totalLogs: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      errorRatio: 0,
    });
  });
});

describe("LogsService / aggregateLevelBuckets", () => {
  it("部分级别缺失 → 补 3 级零填充，顺序固定 info/warn/error", async () => {
    const { service } = createStubDb([
      [
        { level: "info", n: "120" },
        { level: "error", n: "12" },
      ],
    ]);
    const svc = new LogsService(service);
    const out = await svc.aggregateLevelBuckets(WINDOW);
    expect(out).toEqual([
      { level: "info", count: 120 },
      { level: "warn", count: 0 },
      { level: "error", count: 12 },
    ]);
  });
});

describe("LogsService / aggregateTrend", () => {
  it("Date / ISO 双路归一 + 三折线 info/warn/error", async () => {
    const { service } = createStubDb([
      [
        {
          hour: new Date("2026-04-29T10:00:00.000Z"),
          info: "20",
          warn: "5",
          err: "1",
        },
        {
          hour: "2026-04-29T11:00:00.000Z",
          info: 0,
          warn: 0,
          err: 0,
        },
      ],
    ]);
    const svc = new LogsService(service);
    expect(await svc.aggregateTrend(WINDOW)).toEqual([
      {
        hour: "2026-04-29T10:00:00.000Z",
        info: 20,
        warn: 5,
        error: 1,
      },
      {
        hour: "2026-04-29T11:00:00.000Z",
        info: 0,
        warn: 0,
        error: 0,
      },
    ]);
  });
});

describe("LogsService / aggregateTopMessages", () => {
  it("按 level + message_head 分组，字符串强转 + 非法 level 归为 info", async () => {
    const { service, executeSpy } = createStubDb([
      [
        {
          level: "error",
          head: "TypeError: Cannot read properties",
          n: "30",
          last: "1700000003000000",
        },
        {
          level: "unknown",
          head: "weird",
          n: 5,
          last: 1_700_000_002_000_000,
        },
      ],
    ]);
    const svc = new LogsService(service);
    const out = await svc.aggregateTopMessages(WINDOW, 999);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(out).toEqual([
      {
        level: "error",
        messageHead: "TypeError: Cannot read properties",
        count: 30,
        lastSeenMs: 1_700_000_003_000_000,
      },
      {
        level: "info",
        messageHead: "weird",
        count: 5,
        lastSeenMs: 1_700_000_002_000_000,
      },
    ]);
  });
});

/** CustomLog fixture（最小合法字段） */
function buildCustomLog(overrides: Partial<CustomLog> = {}): CustomLog {
  return {
    type: "custom_log",
    eventId: "33333333-4444-4555-8666-777777777777",
    projectId: "proj_test",
    publicKey: "pk_demo",
    sessionId: "sess_1",
    timestamp: 1_700_000_000_000,
    level: "info",
    message: "user signed in",
    page: {
      url: "https://app.example.com/",
      path: "/",
    },
    device: {
      ua: "test",
      os: "macOS",
      browser: "Chrome",
      deviceType: "desktop",
      screen: { width: 1920, height: 1080, dpr: 2 },
      language: "en-US",
      timezone: "UTC",
    },
    environment: "test",
    ...overrides,
  };
}
