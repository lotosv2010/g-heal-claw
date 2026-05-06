import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "../../../src/modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../../src/modules/auth/project.guard.js";
import { RolesGuard } from "../../../src/modules/auth/roles.guard.js";
import { ROLES_KEY } from "../../../src/modules/auth/roles.decorator.js";

// ---- mock 辅助 ----

function _makeEnv() {
  return {
    JWT_SECRET: "0123456789012345678901234567890123",
    JWT_EXPIRES_IN: "1h",
    REFRESH_TOKEN_SECRET: "0123456789012345678901234567890123",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: 4,
    NODE_ENV: "test",
  } as never;
}

function makeDb(db: { execute: ReturnType<typeof vi.fn> } | null = null) {
  return { db } as never;
}

function _makeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      set: vi.fn(async (_k: string, v: string) => { store.set(_k, v); }),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      del: vi.fn(async (k: string) => { store.delete(k); }),
    },
  } as never;
}

interface MockRequest {
  headers: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: unknown;
  projectMember?: unknown;
}

function makeContext(req: MockRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

// ---- JwtAuthGuard ----

describe("JwtAuthGuard", () => {
  it("test env 短路 — db=null 注入占位 user", () => {
    const auth = { verifyAccessToken: vi.fn() } as never;
    const guard = new JwtAuthGuard(auth, makeDb(null));

    const req: MockRequest = { headers: {} };
    const result = guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.user).toEqual({
      userId: "usr_test_0001",
      email: "test@test.com",
      role: "admin",
    });
  });

  it("无 Authorization header → 401", () => {
    const auth = { verifyAccessToken: vi.fn() } as never;
    const db = { execute: vi.fn() };
    const guard = new JwtAuthGuard(auth, makeDb(db));

    const req: MockRequest = { headers: {} };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });

  it("合法 token → 注入 req.user", () => {
    const auth = {
      verifyAccessToken: vi.fn().mockReturnValue({
        sub: "usr_abc",
        email: "a@b.com",
        role: "user",
      }),
    } as never;
    const db = { execute: vi.fn() };
    const guard = new JwtAuthGuard(auth, makeDb(db));

    const req: MockRequest = { headers: { authorization: "Bearer valid-token" } };
    const result = guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.user).toEqual({
      userId: "usr_abc",
      email: "a@b.com",
      role: "user",
    });
  });

  it("过期/畸形 token → 401", () => {
    const auth = {
      verifyAccessToken: vi.fn().mockImplementation(() => {
        throw new UnauthorizedException("expired");
      }),
    } as never;
    const db = { execute: vi.fn() };
    const guard = new JwtAuthGuard(auth, makeDb(db));

    const req: MockRequest = { headers: { authorization: "Bearer expired-tok" } };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });
});

// ---- ProjectGuard ----

describe("ProjectGuard", () => {
  it("test env 短路 — db=null 注入 owner", async () => {
    const guard = new ProjectGuard(makeDb(null));
    const req: MockRequest = {
      headers: {},
      params: { projectId: "proj_1" },
      user: { userId: "usr_1", email: "a@b.com", role: "user" },
    };

    const result = await guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.projectMember).toEqual({ projectId: "proj_1", role: "owner" });
  });

  it("无 req.user → 403", async () => {
    const guard = new ProjectGuard(makeDb(null));
    const req: MockRequest = { headers: {}, params: { projectId: "proj_1" } };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("缺少 projectId → 403", async () => {
    const guard = new ProjectGuard(makeDb(null));
    const req: MockRequest = {
      headers: {},
      user: { userId: "usr_1", email: "a@b.com", role: "user" },
    };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("系统 admin 自动放行", async () => {
    const db = { execute: vi.fn() };
    const guard = new ProjectGuard(makeDb(db));
    const req: MockRequest = {
      headers: {},
      params: { projectId: "proj_1" },
      user: { userId: "usr_admin", email: "admin@b.com", role: "admin" },
    };

    const result = await guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.projectMember).toEqual({ projectId: "proj_1", role: "owner" });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("项目成员 → 注入 role", async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([{ role: "member" }]) };
    const guard = new ProjectGuard(makeDb(db));
    const req: MockRequest = {
      headers: {},
      params: { projectId: "proj_1" },
      user: { userId: "usr_1", email: "a@b.com", role: "user" },
    };

    const result = await guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.projectMember).toEqual({ projectId: "proj_1", role: "member" });
  });

  it("非成员 → 403", async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([]) };
    const guard = new ProjectGuard(makeDb(db));
    const req: MockRequest = {
      headers: {},
      params: { projectId: "proj_1" },
      user: { userId: "usr_stranger", email: "s@b.com", role: "user" },
    };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("从 query 提取 projectId", async () => {
    const guard = new ProjectGuard(makeDb(null));
    const req: MockRequest = {
      headers: {},
      query: { projectId: "proj_q" },
      user: { userId: "usr_1", email: "a@b.com", role: "user" },
    };

    const result = await guard.canActivate(makeContext(req));
    expect(result).toBe(true);
    expect(req.projectMember).toEqual({ projectId: "proj_q", role: "owner" });
  });
});

// ---- RolesGuard ----

describe("RolesGuard", () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it("无 @Roles() 声明 → 放行", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);
    const req: MockRequest = {
      headers: {},
      projectMember: { projectId: "p1", role: "viewer" },
    };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it("viewer 被 admin 最低要求拒绝", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const req: MockRequest = {
      headers: {},
      projectMember: { projectId: "p1", role: "viewer" },
    };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      ForbiddenException,
    );
  });

  it("member 被 admin 最低要求拒绝", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const req: MockRequest = {
      headers: {},
      projectMember: { projectId: "p1", role: "member" },
    };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      ForbiddenException,
    );
  });

  it("admin 通过 admin 要求", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const req: MockRequest = {
      headers: {},
      projectMember: { projectId: "p1", role: "admin" },
    };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it("owner 通过所有角色要求", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["admin"]);
    const req: MockRequest = {
      headers: {},
      projectMember: { projectId: "p1", role: "owner" },
    };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it("无 projectMember 上下文 → 403", () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(["member"]);
    const req: MockRequest = { headers: {} };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      ForbiddenException,
    );
  });
});
