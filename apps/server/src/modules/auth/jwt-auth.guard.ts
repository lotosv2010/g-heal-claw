import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../../shared/database/database.service.js";
import { AuthService, type JwtPayload } from "./auth.service.js";

export interface JwtAuthContext {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
}

export type JwtAuthedRequest = FastifyRequest & { user?: JwtAuthContext };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  public constructor(
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<JwtAuthedRequest>();

    // test env 短路
    if (!this.database.db) {
      req.user = {
        userId: "usr_test_0001",
        email: "test@test.com",
        role: "admin",
      };
      return true;
    }

    const header = req.headers.authorization;
    // SSE 场景 EventSource 不支持自定义 headers，允许从 query 参数获取 token
    const queryToken = (req.query as Record<string, string>)?.token;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

    if (!token) {
      throw new UnauthorizedException({
        error: "MISSING_TOKEN",
        message: "需要 Authorization: Bearer <token> 或 ?token=<token>",
      });
    }
    let payload: JwtPayload;
    try {
      payload = this.auth.verifyAccessToken(token);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        error: "INVALID_TOKEN",
        message: "Token 验证失败",
      });
    }

    req.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return true;
  }
}
