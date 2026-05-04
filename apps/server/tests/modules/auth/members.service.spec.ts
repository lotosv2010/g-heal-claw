import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { MembersService } from "../../../src/modules/auth/members.service.js";

interface MockDb {
  execute: ReturnType<typeof vi.fn>;
}

function makeEnv() {
  return { NODE_ENV: "test" } as never;
}

function makeDb(db: MockDb | null = null) {
  return { db } as never;
}

describe("MembersService", () => {
  let service: MembersService;
  let db: MockDb;

  beforeEach(() => {
    db = { execute: vi.fn() };
    service = new MembersService(makeEnv(), makeDb(db));
  });

  // ---- list ----
  it("list — 返回项目成员列表", async () => {
    db.execute.mockResolvedValueOnce([
      {
        user_id: "usr_1",
        email: "a@b.com",
        display_name: "Alice",
        role: "owner",
        joined_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const items = await service.list("proj_1");
    expect(items).toHaveLength(1);
    expect(items[0].email).toBe("a@b.com");
  });

  it("list — db=null → 空数组", async () => {
    const svc = new MembersService(makeEnv(), makeDb(null));
    const items = await svc.list("proj_1");
    expect(items).toEqual([]);
  });

  // ---- invite ----
  it("invite — 成功邀请成员", async () => {
    db.execute
      .mockResolvedValueOnce([
        { id: "usr_2", email: "b@b.com", display_name: "Bob" },
      ]) // 用户存在
      .mockResolvedValueOnce([]) // 不是已有成员
      .mockResolvedValueOnce(undefined); // INSERT

    const member = await service.invite("proj_1", "usr_1", "b@b.com", "member");
    expect(member.email).toBe("b@b.com");
    expect(member.role).toBe("member");
  });

  it("invite — 用户不存在 → 404", async () => {
    db.execute.mockResolvedValueOnce([]); // 用户不存在

    await expect(
      service.invite("proj_1", "usr_1", "ghost@b.com", "member"),
    ).rejects.toThrow(NotFoundException);
  });

  it("invite — 已是成员 → 409", async () => {
    db.execute
      .mockResolvedValueOnce([
        { id: "usr_2", email: "b@b.com", display_name: "Bob" },
      ])
      .mockResolvedValueOnce([{ role: "member" }]); // 已是成员

    await expect(
      service.invite("proj_1", "usr_1", "b@b.com", "member"),
    ).rejects.toThrow(ConflictException);
  });

  // ---- updateRole ----
  it("updateRole — 成功更新", async () => {
    db.execute
      .mockResolvedValueOnce([{ role: "member" }]) // 当前角色
      .mockResolvedValueOnce(undefined); // UPDATE

    await service.updateRole("proj_1", "usr_2", "admin");
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("updateRole — 修改 owner → 403", async () => {
    db.execute.mockResolvedValueOnce([{ role: "owner" }]);

    await expect(
      service.updateRole("proj_1", "usr_owner", "admin"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("updateRole — 成员不存在 → 404", async () => {
    db.execute.mockResolvedValueOnce([]);

    await expect(
      service.updateRole("proj_1", "usr_ghost", "admin"),
    ).rejects.toThrow(NotFoundException);
  });

  // ---- remove ----
  it("remove — 成功移除", async () => {
    db.execute
      .mockResolvedValueOnce([{ role: "member" }]) // 当前角色
      .mockResolvedValueOnce(undefined); // DELETE

    await service.remove("proj_1", "usr_2");
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("remove — 移除 owner → 403", async () => {
    db.execute.mockResolvedValueOnce([{ role: "owner" }]);

    await expect(
      service.remove("proj_1", "usr_owner"),
    ).rejects.toThrow(ForbiddenException);
  });
});
