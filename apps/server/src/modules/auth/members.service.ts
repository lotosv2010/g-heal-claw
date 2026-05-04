import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";

export interface MemberItem {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: string;
  readonly joinedAt: string;
}

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly database: DatabaseService,
  ) {}

  public async list(projectId: string): Promise<readonly MemberItem[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      user_id: string;
      email: string;
      display_name: string | null;
      role: string;
      joined_at: string;
    }>(sql`
      SELECT pm.user_id, u.email, u.display_name, pm.role, pm.joined_at
      FROM project_members pm
      INNER JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ${projectId}
      ORDER BY pm.joined_at ASC
    `);

    return rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      joinedAt: String(r.joined_at),
    }));
  }

  public async invite(
    projectId: string,
    invitedByUserId: string,
    email: string,
    role: string,
  ): Promise<MemberItem> {
    const db = this.database.db;
    if (!db) throw new NotFoundException("数据库不可用");

    // 查找用户
    const users = await db.execute<{
      id: string;
      email: string;
      display_name: string | null;
    }>(
      sql`SELECT id, email, display_name FROM users WHERE email = ${email} AND is_active = true LIMIT 1`,
    );
    if (users.length === 0) {
      throw new NotFoundException({
        error: "USER_NOT_FOUND",
        message: `用户 ${email} 不存在`,
      });
    }

    const targetUser = users[0];

    // 检查是否已是成员
    const existing = await db.execute<{ role: string }>(
      sql`SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUser.id} LIMIT 1`,
    );
    if (existing.length > 0) {
      throw new ConflictException({
        error: "ALREADY_MEMBER",
        message: `${email} 已是项目成员`,
      });
    }

    const now = new Date().toISOString();
    await db.execute(sql`
      INSERT INTO project_members (project_id, user_id, role, invited_by, joined_at)
      VALUES (${projectId}, ${targetUser.id}, ${role}, ${invitedByUserId}, NOW())
    `);

    return {
      userId: targetUser.id,
      email: targetUser.email,
      displayName: targetUser.display_name,
      role,
      joinedAt: now,
    };
  }

  public async updateRole(
    projectId: string,
    targetUserId: string,
    newRole: string,
  ): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    // 禁止修改 owner 角色
    const current = await db.execute<{ role: string }>(
      sql`SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId} LIMIT 1`,
    );
    if (current.length === 0) {
      throw new NotFoundException({
        error: "MEMBER_NOT_FOUND",
        message: "该用户不是项目成员",
      });
    }
    if (current[0].role === "owner") {
      throw new ForbiddenException({
        error: "CANNOT_CHANGE_OWNER",
        message: "不能修改 owner 的角色",
      });
    }

    await db.execute(
      sql`UPDATE project_members SET role = ${newRole} WHERE project_id = ${projectId} AND user_id = ${targetUserId}`,
    );
  }

  public async remove(
    projectId: string,
    targetUserId: string,
  ): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    // 禁止移除 owner
    const current = await db.execute<{ role: string }>(
      sql`SELECT role FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId} LIMIT 1`,
    );
    if (current.length === 0) {
      throw new NotFoundException({
        error: "MEMBER_NOT_FOUND",
        message: "该用户不是项目成员",
      });
    }
    if (current[0].role === "owner") {
      throw new ForbiddenException({
        error: "CANNOT_REMOVE_OWNER",
        message: "不能移除项目 owner",
      });
    }

    await db.execute(
      sql`DELETE FROM project_members WHERE project_id = ${projectId} AND user_id = ${targetUserId}`,
    );
  }
}
