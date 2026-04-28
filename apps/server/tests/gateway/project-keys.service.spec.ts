import { describe, expect, it, vi } from "vitest";
import { ProjectKeysService } from "../../src/gateway/project-keys.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";

/**
 * ProjectKeysService 单测（T1.3.2）
 *
 * 覆盖：
 *  - db=null 短路 → null
 *  - 命中行 → 返回 {projectId, publicKey}
 *  - 未命中 → null（负命中也应缓存）
 *  - 空字符串 publicKey → null
 *  - TTL 内第二次调用不打 DB（缓存生效）
 */

interface ExecuteStub {
  (sql: unknown): Promise<readonly Record<string, unknown>[]>;
}

function createStubDb(rows: readonly Record<string, unknown>[]): {
  readonly service: DatabaseService;
  readonly executeSpy: ReturnType<typeof vi.fn>;
} {
  const executeSpy = vi.fn<ExecuteStub>(async () => rows);
  const db = { execute: executeSpy } as unknown as NonNullable<
    DatabaseService["db"]
  >;
  const service = { db } as unknown as DatabaseService;
  return { service, executeSpy };
}

describe("ProjectKeysService / db=null 短路", () => {
  it("db 未就绪时 resolve 返回 null", async () => {
    const nullDb = { db: null } as unknown as DatabaseService;
    const svc = new ProjectKeysService(nullDb);
    expect(await svc.resolve("pk_any")).toBeNull();
  });

  it("空 publicKey 返回 null（不打 DB）", async () => {
    const { service, executeSpy } = createStubDb([]);
    const svc = new ProjectKeysService(service);
    expect(await svc.resolve("")).toBeNull();
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe("ProjectKeysService / 解析与缓存", () => {
  it("命中活跃 key → 返回结构化结果", async () => {
    const { service } = createStubDb([
      { project_id: "proj_demo", public_key: "pk_abc" },
    ]);
    const svc = new ProjectKeysService(service);
    const r = await svc.resolve("pk_abc");
    expect(r).toEqual({ projectId: "proj_demo", publicKey: "pk_abc" });
  });

  it("未命中 → 返回 null", async () => {
    const { service } = createStubDb([]);
    const svc = new ProjectKeysService(service);
    expect(await svc.resolve("pk_missing")).toBeNull();
  });

  it("TTL 内重复调用命中缓存（execute 仅 1 次）", async () => {
    const { service, executeSpy } = createStubDb([
      { project_id: "proj_demo", public_key: "pk_cached" },
    ]);
    const svc = new ProjectKeysService(service);
    await svc.resolve("pk_cached");
    await svc.resolve("pk_cached");
    await svc.resolve("pk_cached");
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("负命中也缓存（避免打垮 DB）", async () => {
    const { service, executeSpy } = createStubDb([]);
    const svc = new ProjectKeysService(service);
    expect(await svc.resolve("pk_none")).toBeNull();
    expect(await svc.resolve("pk_none")).toBeNull();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("clearCache 后重新查询", async () => {
    const { service, executeSpy } = createStubDb([
      { project_id: "proj_demo", public_key: "pk_x" },
    ]);
    const svc = new ProjectKeysService(service);
    await svc.resolve("pk_x");
    svc.clearCache();
    await svc.resolve("pk_x");
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });
});
