import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { generateChannelId } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";

/**
 * 渠道记录行结构
 */
export interface ChannelRow {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly type: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 创建渠道输入
 */
export interface CreateChannelInput {
  readonly name: string;
  readonly type: string;
  readonly config: Record<string, unknown>;
}

/**
 * 更新渠道输入
 */
export interface UpdateChannelInput {
  readonly name?: string;
  readonly type?: string;
  readonly config?: Record<string, unknown>;
}

/**
 * ChannelService（ADR-0035 T4.2.1）
 *
 * 通知渠道 CRUD + 批量查询（供 Worker 分发时使用）
 */
@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  public constructor(private readonly database: DatabaseService) {}

  /** 列出项目下所有通知渠道 */
  public async listChannels(projectId: string): Promise<readonly ChannelRow[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      project_id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, project_id, name, type, config, created_at, updated_at
      FROM notification_channels
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      type: r.type,
      config: r.config,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /** 创建通知渠道 */
  public async createChannel(
    projectId: string,
    input: CreateChannelInput,
  ): Promise<ChannelRow> {
    const db = this.database.db;
    if (!db) throw new Error("数据库不可用");

    const id = generateChannelId();

    await db.execute(sql`
      INSERT INTO notification_channels (id, project_id, name, type, config, created_at, updated_at)
      VALUES (
        ${id},
        ${projectId},
        ${input.name},
        ${input.type},
        ${JSON.stringify(input.config)}::jsonb,
        NOW(),
        NOW()
      )
    `);

    this.logger.log(`通知渠道已创建: ${id} (project=${projectId}, type=${input.type})`);

    return {
      id,
      projectId,
      name: input.name,
      type: input.type,
      config: input.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** 更新通知渠道 */
  public async updateChannel(
    channelId: string,
    input: UpdateChannelInput,
  ): Promise<ChannelRow | null> {
    const db = this.database.db;
    if (!db) return null;

    await db.execute(sql`
      UPDATE notification_channels
      SET name = COALESCE(${input.name ?? null}, name),
          type = COALESCE(${input.type ?? null}, type),
          config = COALESCE(${input.config ? JSON.stringify(input.config) : null}::jsonb, config),
          updated_at = NOW()
      WHERE id = ${channelId}
    `);

    // 查询更新后的记录
    const rows = await db.execute<{
      id: string;
      project_id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, project_id, name, type, config, created_at, updated_at
      FROM notification_channels
      WHERE id = ${channelId}
      LIMIT 1
    `);

    if (rows.length === 0) return null;

    const r = rows[0]!;
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      type: r.type,
      config: r.config,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /** 删除通知渠道 */
  public async deleteChannel(channelId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(sql`
      DELETE FROM notification_channels
      WHERE id = ${channelId}
      RETURNING id
    `);

    if (rows.length > 0) {
      this.logger.log(`通知渠道已删除: ${channelId}`);
    }

    return rows.length > 0;
  }

  /** 根据 ID 数组批量获取渠道（供通知 Worker 分发使用） */
  public async getChannelsByIds(ids: readonly string[]): Promise<readonly ChannelRow[]> {
    const db = this.database.db;
    if (!db) return [];
    if (ids.length === 0) return [];

    const rows = await db.execute<{
      id: string;
      project_id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, project_id, name, type, config, created_at, updated_at
      FROM notification_channels
      WHERE id = ANY(${ids as string[]}::text[])
    `);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      type: r.type,
      config: r.config,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }
}
