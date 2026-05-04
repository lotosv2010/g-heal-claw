import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { TokensService } from "../../../src/modules/auth/tokens.service.js";

interface MockDb {
  execute: ReturnType<typeof vi.fn>;
}

function makeEnv() {
  return { NODE_ENV: "test" } as never;
}

function makeDb(db: MockDb | null = null) {
  return { db } as never;
}

describe("TokensService", () => {
  let service: TokensService;
  let db: MockDb;

  beforeEach(() => {
    db = { execute: vi.fn() };
    service = new TokensService(makeEnv(), makeDb(db));
  });

  // ---- list ----
  it("list — 返回脱敏的 token 列表", async () => {
    db.execute.mockResolvedValueOnce([
      {
        id: "pk_1",
        public_key: "pub_abc123",
        secret_key: "sec_verylongsecretkey123456789",
        label: "default",
        is_active: true,
        last_used_at: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);

    const items = await service.list("proj_1");
    expect(items).toHaveLength(1);
    expect(items[0].publicKey).toBe("pub_abc123");
    // secretKey 应被脱敏
    expect(items[0].secretKeyMasked).toContain("****");
    expect(items[0].secretKeyMasked).not.toBe("sec_verylongsecretkey123456789");
  });

  it("list — db=null → 空数组", async () => {
    const svc = new TokensService(makeEnv(), makeDb(null));
    const items = await svc.list("proj_1");
    expect(items).toEqual([]);
  });

  // ---- create ----
  it("create — 返回完整 secretKey", async () => {
    db.execute.mockResolvedValueOnce(undefined); // INSERT

    const token = await service.create("proj_1", "my-token");
    expect(token.publicKey).toMatch(/^pub_/);
    expect(token.secretKey).toMatch(/^sec_/);
    expect(token.label).toBe("my-token");
    expect(token.isActive).toBe(true);
  });

  it("create — db=null → NotFoundException", async () => {
    const svc = new TokensService(makeEnv(), makeDb(null));
    await expect(svc.create("proj_1")).rejects.toThrow(NotFoundException);
  });

  // ---- toggleActive ----
  it("toggleActive — 成功 → true", async () => {
    db.execute.mockResolvedValueOnce([{ id: "pk_1" }]);
    const result = await service.toggleActive("proj_1", "pk_1", false);
    expect(result).toBe(true);
  });

  it("toggleActive — 不存在 → false", async () => {
    db.execute.mockResolvedValueOnce([]);
    const result = await service.toggleActive("proj_1", "pk_missing", false);
    expect(result).toBe(false);
  });

  // ---- remove ----
  it("remove — 成功 → true", async () => {
    db.execute.mockResolvedValueOnce([{ id: "pk_1" }]);
    const result = await service.remove("proj_1", "pk_1");
    expect(result).toBe(true);
  });

  it("remove — 不存在 → false", async () => {
    db.execute.mockResolvedValueOnce([]);
    const result = await service.remove("proj_1", "pk_missing");
    expect(result).toBe(false);
  });
});
