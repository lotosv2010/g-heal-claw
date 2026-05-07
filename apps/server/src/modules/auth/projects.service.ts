import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  generateProjectId,
  generateProjectKeyId,
  generateAlertRuleId,
} from "@g-heal-claw/shared";
import { PRESET_ALERT_RULES } from "../alert/preset-rules.js";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";

export interface ProjectDetail {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly platform: string;
  readonly ownerUserId: string;
  readonly retentionDays: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectListItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly platform: string;
  readonly role: string;
  readonly createdAt: string;
}

const DEFAULT_ENVS = [
  { name: "development", description: "开发环境", isProduction: false },
  { name: "staging", description: "预发布环境", isProduction: false },
  { name: "production", description: "生产环境", isProduction: true },
] as const;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly database: DatabaseService,
  ) {}

  // 生成 URL-safe 随机 key
  private generateKey(prefix: string): string {
    return `${prefix}_${randomBytes(24).toString("base64url")}`;
  }

  public async create(
    userId: string,
    input: { name: string; slug: string; platform?: string },
  ): Promise<ProjectDetail & { publicKey: string; secretKey: string }> {
    const db = this.database.db;
    if (!db) throw new UnauthorizedException("数据库不可用");

    const projectId = generateProjectId();
    const keyId = generateProjectKeyId();
    const publicKey = this.generateKey("pub");
    const secretKey = this.generateKey("sec");
    const platform = input.platform ?? "web";

    // 使用 Drizzle transaction API（postgres.js 禁止裸 BEGIN/COMMIT）
    await db.transaction(async (tx) => {
      // slug 唯一性在 DB 约束保证，但提前检查给出友好错误
      const existing = await tx.execute<{ id: string }>(
        sql`SELECT id FROM projects WHERE slug = ${input.slug} LIMIT 1`,
      );
      if (existing.length > 0) {
        throw new ConflictException({
          error: "SLUG_EXISTS",
          message: `slug "${input.slug}" 已被占用`,
        });
      }

      await tx.execute(sql`
        INSERT INTO projects (id, slug, name, platform, owner_user_id, retention_days, is_active, created_at, updated_at)
        VALUES (${projectId}, ${input.slug}, ${input.name}, ${platform}, ${userId}, 30, true, NOW(), NOW())
      `);

      await tx.execute(sql`
        INSERT INTO project_members (project_id, user_id, role, invited_by, joined_at)
        VALUES (${projectId}, ${userId}, 'owner', ${userId}, NOW())
      `);

      await tx.execute(sql`
        INSERT INTO project_keys (id, project_id, public_key, secret_key, label, is_active, created_at)
        VALUES (${keyId}, ${projectId}, ${publicKey}, ${secretKey}, 'default', true, NOW())
      `);

      for (const env of DEFAULT_ENVS) {
        await tx.execute(sql`
          INSERT INTO environments (project_id, name, description, is_production, created_at)
          VALUES (${projectId}, ${env.name}, ${env.description}, ${env.isProduction}, NOW())
        `);
      }

      // 插入预设告警规则（默认禁用，用户可手动启用）
      for (const rule of PRESET_ALERT_RULES) {
        const ruleId = generateAlertRuleId();
        await tx.execute(sql`
          INSERT INTO alert_rules (id, project_id, name, target, condition, filter,
                                   severity, cooldown_ms, channels, enabled, created_at, updated_at)
          VALUES (
            ${ruleId},
            ${projectId},
            ${rule.name},
            ${rule.target},
            ${JSON.stringify(rule.condition)}::jsonb,
            ${rule.filter ? JSON.stringify(rule.filter) : null}::jsonb,
            ${rule.severity},
            ${rule.cooldownMs},
            '{}',
            false,
            NOW(),
            NOW()
          )
        `);
      }
    });

    return {
      id: projectId,
      slug: input.slug,
      name: input.name,
      platform,
      ownerUserId: userId,
      retentionDays: 30,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publicKey,
      secretKey,
    };
  }

  public async list(userId: string): Promise<readonly ProjectListItem[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      slug: string;
      name: string;
      platform: string;
      role: string;
      created_at: string;
    }>(sql`
      SELECT p.id, p.slug, p.name, p.platform, pm.role, p.created_at
      FROM projects p
      INNER JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = ${userId} AND p.is_active = true
      ORDER BY p.created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      platform: r.platform,
      role: r.role,
      createdAt: String(r.created_at),
    }));
  }

  public async getById(projectId: string): Promise<ProjectDetail | null> {
    const db = this.database.db;
    if (!db) return null;

    const rows = await db.execute<{
      id: string;
      slug: string;
      name: string;
      platform: string;
      owner_user_id: string;
      retention_days: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, slug, name, platform, owner_user_id, retention_days, is_active, created_at, updated_at
      FROM projects WHERE id = ${projectId} AND is_active = true LIMIT 1
    `);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      platform: r.platform,
      ownerUserId: r.owner_user_id,
      retentionDays: r.retention_days,
      isActive: r.is_active,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public async update(
    projectId: string,
    input: {
      name?: string;
      slug?: string;
      platform?: string;
      retentionDays?: number;
    },
  ): Promise<ProjectDetail | null> {
    const db = this.database.db;
    if (!db) return null;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      sets.push("name");
      values.push(input.name);
    }
    if (input.slug !== undefined) {
      // slug 唯一性检查
      const existing = await db.execute<{ id: string }>(
        sql`SELECT id FROM projects WHERE slug = ${input.slug} AND id != ${projectId} LIMIT 1`,
      );
      if (existing.length > 0) {
        throw new ConflictException({
          error: "SLUG_EXISTS",
          message: `slug "${input.slug}" 已被占用`,
        });
      }
      sets.push("slug");
      values.push(input.slug);
    }
    if (input.platform !== undefined) {
      sets.push("platform");
      values.push(input.platform);
    }
    if (input.retentionDays !== undefined) {
      sets.push("retention_days");
      values.push(input.retentionDays);
    }

    if (sets.length === 0) {
      return this.getById(projectId);
    }

    // 动态 SET 构建
    const setClauses = sets.map((col, i) => sql`${sql.raw(col)} = ${values[i]}`);
    await db.execute(
      sql`UPDATE projects SET ${sql.join(setClauses, sql`, `)}, updated_at = NOW() WHERE id = ${projectId} AND is_active = true`,
    );

    return this.getById(projectId);
  }

  public async softDelete(projectId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(
      sql`UPDATE projects SET is_active = false, updated_at = NOW()
          WHERE id = ${projectId} AND is_active = true
          RETURNING id`,
    );
    return rows.length > 0;
  }
}
