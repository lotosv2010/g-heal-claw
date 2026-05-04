import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../../../src/modules/auth/auth.service.js";

// mock 辅助
function makeEnv() {
  return {
    JWT_SECRET: "0123456789012345678901234567890123",
    JWT_EXPIRES_IN: "1h",
    REFRESH_TOKEN_SECRET: "0123456789012345678901234567890123",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: 4,
    NODE_ENV: "test",
  } as never;
}

interface MockDb {
  execute: ReturnType<typeof vi.fn>;
}

function makeDb(db: MockDb | null = null) {
  return { db } as never;
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
        store.set(key, value);
      }),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      del: vi.fn(async (key: string) => { store.delete(key); }),
    },
    _store: store,
  } as never;
}

describe("AuthService", () => {
  let service: AuthService;
  let db: MockDb;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(() => {
    db = { execute: vi.fn() };
    redis = makeRedis();
    service = new AuthService(makeEnv(), makeDb(db), redis);
  });

  // ---- 注册 ----
  it("register — 成功注册返回 tokens + user", async () => {
    db.execute
      .mockResolvedValueOnce([]) // 邮箱不存在
      .mockResolvedValueOnce([]); // INSERT

    const result = await service.register("a@b.com", "password123", "Alice");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(result.user.email).toBe("a@b.com");
    expect(result.user.displayName).toBe("Alice");
    expect(result.user.role).toBe("user");
  });

  it("register — 邮箱已存在 → 409", async () => {
    db.execute.mockResolvedValueOnce([{ id: "usr_exist" }]);

    await expect(
      service.register("dup@b.com", "password123"),
    ).rejects.toThrow(ConflictException);
  });

  // ---- 登录 ----
  it("login — 成功返回 tokens + user", async () => {
    // bcrypt hash for "password123" with 4 rounds
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("password123", 4);

    db.execute
      .mockResolvedValueOnce([{
        id: "usr_abc",
        email: "a@b.com",
        password_hash: hash,
        display_name: "Alice",
        role: "user",
        is_active: true,
        last_login_at: null,
        created_at: "2026-01-01T00:00:00Z",
      }])
      .mockResolvedValueOnce([]); // UPDATE last_login_at

    const result = await service.login("a@b.com", "password123");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.user.id).toBe("usr_abc");
  });

  it("login — 密码错误 → 401", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("correct", 4);

    db.execute.mockResolvedValueOnce([{
      id: "usr_abc",
      email: "a@b.com",
      password_hash: hash,
      display_name: null,
      role: "user",
      is_active: true,
      last_login_at: null,
      created_at: "2026-01-01T00:00:00Z",
    }]);

    await expect(
      service.login("a@b.com", "wrong"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("login — 用户不存在 → 401（不泄露用户是否存在）", async () => {
    db.execute.mockResolvedValueOnce([]);

    await expect(
      service.login("nobody@b.com", "pass"),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ---- 刷新 ----
  it("refresh — 有效 token 返回新对 + 旧 token 失效", async () => {
    // 先注册获取 refresh token
    db.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { tokens } = await service.register("r@b.com", "password123");

    const newTokens = await service.refresh(tokens.refreshToken);
    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);

    // 旧 token 再次 refresh 应失败
    await expect(
      service.refresh(tokens.refreshToken),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("refresh — 无效 token → 401", async () => {
    await expect(
      service.refresh("invalid-token"),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ---- 登出 ----
  it("logout — 删除 refresh token", async () => {
    db.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { tokens } = await service.register("lo@b.com", "password123");

    await service.logout(tokens.refreshToken);

    // refresh 应失败
    await expect(
      service.refresh(tokens.refreshToken),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ---- getMe ----
  it("getMe — 返回用户信息", async () => {
    db.execute.mockResolvedValueOnce([{
      id: "usr_abc",
      email: "me@b.com",
      display_name: "Me",
      role: "user",
      is_active: true,
      last_login_at: null,
      created_at: "2026-01-01T00:00:00Z",
    }]);

    const user = await service.getMe("usr_abc");
    expect(user?.email).toBe("me@b.com");
  });

  // ---- verifyAccessToken ----
  it("verifyAccessToken — 合法 token 返回 payload", async () => {
    db.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const { tokens } = await service.register("v@b.com", "password123");

    const payload = service.verifyAccessToken(tokens.accessToken);
    expect(payload.email).toBe("v@b.com");
    expect(payload.role).toBe("admin"); // dev/test 环境默认 admin
  });

  it("verifyAccessToken — 无效 token → 401", () => {
    expect(() => service.verifyAccessToken("garbage")).toThrow(
      UnauthorizedException,
    );
  });

  // ---- db=null 短路 ----
  it("register — db=null → 401", async () => {
    const svc = new AuthService(makeEnv(), makeDb(null), redis);
    await expect(
      svc.register("x@b.com", "pass"),
    ).rejects.toThrow(UnauthorizedException);
  });
});
