import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { ProjectsService } from "../../../src/modules/auth/projects.service.js";

interface MockDb {
  execute: ReturnType<typeof vi.fn>;
}

function makeEnv() {
  return { NODE_ENV: "test" } as never;
}

function makeDb(db: MockDb | null = null) {
  return { db } as never;
}

describe("ProjectsService", () => {
  let service: ProjectsService;
  let db: MockDb;

  beforeEach(() => {
    db = { execute: vi.fn() };
    service = new ProjectsService(makeEnv(), makeDb(db));
  });

  // ---- create ----
  it("create — 成功创建项目（4 表联写）", async () => {
    // BEGIN + slug check + projects + members + keys + env×3 + COMMIT = 9 calls
    db.execute
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce([]) // slug 不存在
      .mockResolvedValueOnce(undefined) // INSERT projects
      .mockResolvedValueOnce(undefined) // INSERT project_members
      .mockResolvedValueOnce(undefined) // INSERT project_keys
      .mockResolvedValueOnce(undefined) // INSERT env development
      .mockResolvedValueOnce(undefined) // INSERT env staging
      .mockResolvedValueOnce(undefined) // INSERT env production
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await service.create("usr_1", {
      name: "Test Project",
      slug: "test-proj",
    });

    expect(result.slug).toBe("test-proj");
    expect(result.name).toBe("Test Project");
    expect(result.platform).toBe("web");
    expect(result.ownerUserId).toBe("usr_1");
    expect(result.publicKey).toMatch(/^pub_/);
    expect(result.secretKey).toMatch(/^sec_/);
    // 9（原事务）+ 6（预置告警规则 ADR-0035）= 15
    expect(db.execute).toHaveBeenCalledTimes(15);
  });

  it("create — slug 已存在 → 409 + ROLLBACK", async () => {
    db.execute
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce([{ id: "proj_existing" }]) // slug 存在
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(
      service.create("usr_1", { name: "Dup", slug: "existing-slug" }),
    ).rejects.toThrow(ConflictException);
  });

  it("create — db=null → 401", async () => {
    const svc = new ProjectsService(makeEnv(), makeDb(null));
    await expect(
      svc.create("usr_1", { name: "No DB", slug: "no-db" }),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ---- list ----
  it("list — 返回用户的项目列表", async () => {
    db.execute.mockResolvedValueOnce([
      {
        id: "proj_1",
        slug: "my-proj",
        name: "My Project",
        platform: "web",
        role: "owner",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const items = await service.list("usr_1");
    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe("my-proj");
    expect(items[0].role).toBe("owner");
  });

  it("list — db=null → 空数组", async () => {
    const svc = new ProjectsService(makeEnv(), makeDb(null));
    const items = await svc.list("usr_1");
    expect(items).toEqual([]);
  });

  // ---- getById ----
  it("getById — 存在 → 返回详情", async () => {
    db.execute.mockResolvedValueOnce([
      {
        id: "proj_1",
        slug: "my-proj",
        name: "My Project",
        platform: "web",
        owner_user_id: "usr_1",
        retention_days: 30,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const project = await service.getById("proj_1");
    expect(project).not.toBeNull();
    expect(project!.slug).toBe("my-proj");
  });

  it("getById — 不存在 → null", async () => {
    db.execute.mockResolvedValueOnce([]);
    const project = await service.getById("proj_missing");
    expect(project).toBeNull();
  });

  // ---- update ----
  it("update — 修改 name 成功", async () => {
    // update + getById
    db.execute
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce([
        {
          id: "proj_1",
          slug: "my-proj",
          name: "New Name",
          platform: "web",
          owner_user_id: "usr_1",
          retention_days: 30,
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-05-04T00:00:00Z",
        },
      ]);

    const project = await service.update("proj_1", { name: "New Name" });
    expect(project!.name).toBe("New Name");
  });

  it("update — slug 冲突 → 409", async () => {
    db.execute.mockResolvedValueOnce([{ id: "proj_other" }]); // slug 已存在

    await expect(
      service.update("proj_1", { slug: "taken-slug" }),
    ).rejects.toThrow(ConflictException);
  });

  // ---- softDelete ----
  it("softDelete — 成功 → true", async () => {
    db.execute.mockResolvedValueOnce([{ id: "proj_1" }]);
    const result = await service.softDelete("proj_1");
    expect(result).toBe(true);
  });

  it("softDelete — 不存在 → false", async () => {
    db.execute.mockResolvedValueOnce([]);
    const result = await service.softDelete("proj_missing");
    expect(result).toBe(false);
  });
});
