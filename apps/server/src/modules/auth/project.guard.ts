import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../../shared/database/database.service.js";
import type { JwtAuthContext, JwtAuthedRequest } from "./jwt-auth.guard.js";
import type { ProjectRole } from "./roles.decorator.js";

export interface ProjectMemberContext {
  readonly projectId: string;
  readonly role: ProjectRole;
}

export type ProjectAuthedRequest = FastifyRequest & {
  user?: JwtAuthContext;
  projectMember?: ProjectMemberContext;
};

/**
 * ProjectGuard（ADR-0032 §3.2）
 *
 * 前置依赖：JwtAuthGuard 已注入 req.user
 * 流程：
 *  1. 从 params / query / body 提取 projectId
 *  2. 系统 admin → 自动放行（role = "admin"）
 *  3. 查 project_members 表确认用户是否为项目成员
 *  4. 注入 req.projectMember = { projectId, role }
 */
@Injectable()
export class ProjectGuard implements CanActivate {
  private readonly logger = new Logger(ProjectGuard.name);

  public constructor(private readonly database: DatabaseService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ProjectAuthedRequest>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException({
        error: "AUTH_REQUIRED",
        message: "需要先通过 JwtAuthGuard 认证",
      });
    }

    const projectId = this.extractProjectId(req);
    if (!projectId) {
      throw new ForbiddenException({
        error: "MISSING_PROJECT_ID",
        message: "请求中缺少 projectId",
      });
    }

    const db = this.database.db;
    // test env 短路
    if (!db) {
      req.projectMember = { projectId, role: "owner" };
      return true;
    }

    // 系统级 admin 自动放行
    if (user.role === "admin") {
      req.projectMember = { projectId, role: "owner" };
      return true;
    }

    const rows = await db.execute<{ role: string }>(
      sql`SELECT role FROM project_members
          WHERE project_id = ${projectId} AND user_id = ${user.userId}
          LIMIT 1`,
    );

    if (rows.length === 0) {
      throw new ForbiddenException({
        error: "NOT_PROJECT_MEMBER",
        message: "您不是该项目成员",
      });
    }

    req.projectMember = {
      projectId,
      role: rows[0].role as ProjectRole,
    };
    return true;
  }

  private extractProjectId(req: FastifyRequest): string | undefined {
    const params = req.params as Record<string, string> | undefined;
    if (params?.projectId) return params.projectId;

    const query = req.query as Record<string, string> | undefined;
    if (query?.projectId) return query.projectId;

    const body = req.body as Record<string, unknown> | undefined;
    if (typeof body?.projectId === "string") return body.projectId;

    return undefined;
  }
}
