import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DsnAuthGuard } from "../../src/gateway/dsn-auth.guard.js";
import type { ProjectKeysService } from "../../src/gateway/project-keys.service.js";
import type { DatabaseService } from "../../src/shared/database/database.service.js";

/**
 * DsnAuthGuard 单测（T1.3.2）
 *
 * 覆盖：
 *  - 缺 DSN / 格式错误 → 401 INVALID_DSN
 *  - db=null → bypass 放行 + 注入 auth
 *  - 未命中 key → 401 UNKNOWN_KEY
 *  - key 命中但 projectId 不匹配 → 401 PROJECT_MISMATCH
 *  - 命中且 projectId 匹配 → 放行 + 注入 auth
 */

function ctx(body: unknown): {
  readonly exec: ExecutionContext;
  readonly req: { body: unknown; auth?: unknown };
} {
  const req: { body: unknown; auth?: unknown } = { body };
  const exec = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { exec, req };
}

function guard(opts: {
  readonly dbReady: boolean;
  readonly resolveReturn?: { projectId: string; publicKey: string } | null;
}): {
  readonly g: DsnAuthGuard;
  readonly resolveSpy: ReturnType<typeof vi.fn>;
} {
  const resolveSpy = vi.fn(async () => opts.resolveReturn ?? null);
  const projectKeys = { resolve: resolveSpy } as unknown as ProjectKeysService;
  const database = {
    db: opts.dbReady ? ({} as unknown) : null,
  } as unknown as DatabaseService;
  return { g: new DsnAuthGuard(projectKeys, database), resolveSpy };
}

describe("DsnAuthGuard / DSN 解析失败", () => {
  it("body.dsn 缺失 → 401 INVALID_DSN", async () => {
    const { g } = guard({ dbReady: true });
    const { exec } = ctx({ sentAt: 1, events: [] });
    await expect(g.canActivate(exec)).rejects.toThrow(UnauthorizedException);
  });

  it("body.dsn 非 URL → 401 INVALID_DSN", async () => {
    const { g } = guard({ dbReady: true });
    const { exec } = ctx({ dsn: "not-a-url" });
    await expect(g.canActivate(exec)).rejects.toMatchObject({
      response: expect.objectContaining({ error: "INVALID_DSN" }),
    });
  });
});

describe("DsnAuthGuard / db=null bypass", () => {
  it("DB 未就绪时合法 DSN 放行 + 注入 auth", async () => {
    const { g, resolveSpy } = guard({ dbReady: false });
    const { exec, req } = ctx({
      dsn: "http://pk_test@localhost:3001/proj_test",
    });
    const ok = await g.canActivate(exec);
    expect(ok).toBe(true);
    // bypass 不应打 DB
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(req.auth).toEqual({ projectId: "proj_test", publicKey: "pk_test" });
  });
});

describe("DsnAuthGuard / DB 鉴权", () => {
  it("未命中 → 401 UNKNOWN_KEY", async () => {
    const { g } = guard({ dbReady: true, resolveReturn: null });
    const { exec } = ctx({
      dsn: "http://pk_missing@localhost:3001/proj_test",
    });
    await expect(g.canActivate(exec)).rejects.toMatchObject({
      response: expect.objectContaining({ error: "UNKNOWN_KEY" }),
    });
  });

  it("projectId 不匹配 → 401 PROJECT_MISMATCH", async () => {
    const { g } = guard({
      dbReady: true,
      resolveReturn: { projectId: "proj_real", publicKey: "pk_abc" },
    });
    const { exec } = ctx({
      dsn: "http://pk_abc@localhost:3001/proj_fake",
    });
    await expect(g.canActivate(exec)).rejects.toMatchObject({
      response: expect.objectContaining({ error: "PROJECT_MISMATCH" }),
    });
  });

  it("匹配通过 → 放行 + 注入 auth（来自 DB 权威值）", async () => {
    const { g } = guard({
      dbReady: true,
      resolveReturn: { projectId: "proj_real", publicKey: "pk_abc" },
    });
    const { exec, req } = ctx({
      dsn: "http://pk_abc@localhost:3001/proj_real",
    });
    const ok = await g.canActivate(exec);
    expect(ok).toBe(true);
    expect(req.auth).toEqual({
      projectId: "proj_real",
      publicKey: "pk_abc",
    });
  });
});
