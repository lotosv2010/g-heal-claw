import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../../shared/database/database.service.js";

export interface ApiKeyAuthContext {
  projectId: string;
  secretKey: string;
}

export type ApiKeyAuthedRequest = FastifyRequest & {
  apiKeyAuth?: ApiKeyAuthContext;
};

/**
 * X-Api-Key 鉴权（ADR-0031 §7）
 *
 * 用于 Sourcemap CRUD 等 CLI/CI 场景，读 secret_key 而非 public_key。
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  public constructor(private readonly database: DatabaseService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiKeyAuthedRequest>();
    const apiKey = req.headers["x-api-key"];
    const key = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    if (!key || typeof key !== "string" || key.length < 8) {
      throw new UnauthorizedException({
        error: "MISSING_API_KEY",
        message: "X-Api-Key header 缺失或格式非法",
      });
    }

    const db = this.database.db;
    if (!db) {
      // test 环境放行，注入占位 context
      req.apiKeyAuth = { projectId: "test_project", secretKey: key };
      return true;
    }

    const rows = await db.execute<{
      project_id: string;
      secret_key: string;
    }>(sql`
      SELECT k.project_id, k.secret_key
      FROM project_keys k
      INNER JOIN projects p ON p.id = k.project_id
      WHERE k.secret_key = ${key}
        AND k.is_active = true
        AND p.is_active = true
      LIMIT 1
    `);

    if (rows.length === 0) {
      this.logger.warn(`ApiKeyGuard: secret_key 无效或已禁用`);
      throw new UnauthorizedException({
        error: "INVALID_API_KEY",
        message: "API Key 无效或已禁用",
      });
    }

    req.apiKeyAuth = {
      projectId: rows[0].project_id,
      secretKey: rows[0].secret_key,
    };
    return true;
  }
}
