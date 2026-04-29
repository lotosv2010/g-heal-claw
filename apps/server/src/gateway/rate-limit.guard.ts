import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { GatewayAuthContext } from "./dsn-auth.guard.js";
import { RateLimitService } from "./rate-limit.service.js";

/** FastifyRequest 扩展：由 DsnAuthGuard 注入的 auth 字段 */
type AuthedRequest = FastifyRequest & { auth?: GatewayAuthContext };

/**
 * Gateway 项目级限流 Guard（T1.3.3 / ADR-0016 §4）
 *
 * 必须在 DsnAuthGuard 之后执行：依赖 req.auth.projectId 区分租户。
 * 超限 → 429 `RATE_LIMITED`，附 Retry-After 头（秒级向上取整）
 * Redis 缺席 → RateLimitService 返回 allowed=true，静默放行
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  public constructor(private readonly rateLimit: RateLimitService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<FastifyReply>();

    const projectId = req.auth?.projectId;
    if (!projectId) {
      // 无 auth 上下文意味着 DsnAuthGuard 未放行 —— 理论上不会到这里
      this.logger.warn("RateLimitGuard 缺少 auth.projectId，放行");
      return true;
    }

    const result = await this.rateLimit.consume(projectId, 1);
    if (result.allowed) {
      // 头部协助客户端自适应节流
      res.header("X-RateLimit-Remaining", String(result.remaining));
      return true;
    }

    const retryAfterSec = Math.max(
      1,
      Math.ceil((result.retryAfterMs > 0 ? result.retryAfterMs : 1000) / 1000),
    );
    res.header("Retry-After", String(retryAfterSec));
    res.header("X-RateLimit-Remaining", "0");
    throw new HttpException(
      {
        error: "RATE_LIMITED",
        message: "项目级限流触发，请稍后重试",
        retryAfterMs: result.retryAfterMs,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
