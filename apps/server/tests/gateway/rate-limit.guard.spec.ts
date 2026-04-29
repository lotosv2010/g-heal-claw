import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { RateLimitGuard } from "../../src/gateway/rate-limit.guard.js";
import type { RateLimitService } from "../../src/gateway/rate-limit.service.js";

/**
 * RateLimitGuard 单测（T1.3.3 / ADR-0016 §4）
 *
 * 覆盖：
 *  - 缺 auth → 放行并告警
 *  - allowed=true → set X-RateLimit-Remaining + 放行
 *  - allowed=false → 429 RATE_LIMITED + Retry-After 头
 */

function mockContext(
  auth: { projectId: string } | undefined,
): {
  ctx: ExecutionContext;
  header: ReturnType<typeof vi.fn>;
} {
  const header = vi.fn();
  const req = { auth } as const;
  const res = { header };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, header };
}

function svcStub(result: {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}): RateLimitService {
  return { consume: vi.fn(async () => result) } as unknown as RateLimitService;
}

describe("RateLimitGuard", () => {
  it("缺 auth → 放行", async () => {
    const { ctx } = mockContext(undefined);
    const guard = new RateLimitGuard(
      svcStub({ allowed: true, remaining: 200, retryAfterMs: 0 }),
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it("allowed=true → 设置 X-RateLimit-Remaining 并放行", async () => {
    const { ctx, header } = mockContext({ projectId: "p1" });
    const guard = new RateLimitGuard(
      svcStub({ allowed: true, remaining: 199, retryAfterMs: 0 }),
    );
    await guard.canActivate(ctx);
    expect(header).toHaveBeenCalledWith("X-RateLimit-Remaining", "199");
  });

  it("allowed=false → 抛 429 + Retry-After 头（向上取整）", async () => {
    const { ctx, header } = mockContext({ projectId: "p1" });
    const guard = new RateLimitGuard(
      svcStub({ allowed: false, remaining: 0, retryAfterMs: 1300 }),
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(header).toHaveBeenCalledWith("Retry-After", "2");
    expect(header).toHaveBeenCalledWith("X-RateLimit-Remaining", "0");
  });

  it("retryAfterMs<=0 → Retry-After 兜底为 1 秒", async () => {
    const { ctx, header } = mockContext({ projectId: "p1" });
    const guard = new RateLimitGuard(
      svcStub({ allowed: false, remaining: 0, retryAfterMs: 0 }),
    );
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(header).toHaveBeenCalledWith("Retry-After", "1");
  });

  it("429 响应体含 RATE_LIMITED 错误码", async () => {
    const { ctx } = mockContext({ projectId: "p1" });
    const guard = new RateLimitGuard(
      svcStub({ allowed: false, remaining: 0, retryAfterMs: 2500 }),
    );
    try {
      await guard.canActivate(ctx);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as {
        error: string;
        retryAfterMs: number;
      };
      expect(response.error).toBe("RATE_LIMITED");
      expect(response.retryAfterMs).toBe(2500);
    }
  });
});
