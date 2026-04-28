import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../shared/database/database.service.js";
import { parseDsn } from "./dsn.util.js";
import { ProjectKeysService } from "./project-keys.service.js";

/**
 * `req.auth` 注入形态：后续 Service 从这里取 projectId / publicKey
 */
export interface GatewayAuthContext {
  readonly projectId: string;
  readonly publicKey: string;
}

/** FastifyRequest 扩展：挂载 auth 字段（生命周期 = 本次请求） */
type AuthedRequest = FastifyRequest & { auth?: GatewayAuthContext };

/**
 * Gateway DSN 鉴权 Guard（T1.3.2）
 *
 * 流程：
 *  1. 从 body.dsn 解析 publicKey + projectId；失败 → 401 INVALID_DSN
 *  2. ProjectKeysService.resolve(publicKey)：查 `project_keys` + `projects.is_active`
 *     - DB 未就绪（test / 本地）→ bypass：允许通行并注入 DSN 原始 projectId
 *     - 未命中活跃 key → 401 UNKNOWN_KEY
 *     - 命中但 projectId 与 DSN 不一致 → 401 PROJECT_MISMATCH
 *  3. 注入 req.auth = { projectId, publicKey }，下游 Service 读取
 *
 * Guard 在 Pipe 之前执行，body 已由 Fastify parse 但尚未 Zod 校验。parseDsn 自带空值兜底。
 */
@Injectable()
export class DsnAuthGuard implements CanActivate {
  private readonly logger = new Logger(DsnAuthGuard.name);

  public constructor(
    private readonly projectKeys: ProjectKeysService,
    private readonly database: DatabaseService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const body = req.body as { dsn?: unknown } | undefined;
    const rawDsn = typeof body?.dsn === "string" ? body.dsn : undefined;

    const parsed = parseDsn(rawDsn);
    if (!parsed) {
      throw new UnauthorizedException({
        error: "INVALID_DSN",
        message: "DSN 缺失或格式非法",
      });
    }

    // DB 未就绪（NODE_ENV=test 或启动期间）→ bypass：按 DSN 原样放行，便于 e2e/dev
    if (!this.database.db) {
      req.auth = { projectId: parsed.projectId, publicKey: parsed.publicKey };
      return true;
    }

    const resolved = await this.projectKeys.resolve(parsed.publicKey);
    if (!resolved) {
      throw new UnauthorizedException({
        error: "UNKNOWN_KEY",
        message: "publicKey 未注册或已禁用",
      });
    }
    if (resolved.projectId !== parsed.projectId) {
      throw new UnauthorizedException({
        error: "PROJECT_MISMATCH",
        message: "publicKey 与 projectId 不匹配",
      });
    }

    req.auth = {
      projectId: resolved.projectId,
      publicKey: resolved.publicKey,
    };
    return true;
  }
}
