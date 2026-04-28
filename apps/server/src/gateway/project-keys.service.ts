import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../shared/database/database.service.js";

/**
 * DSN 鉴权解析结果（T1.3.2）
 *
 * 仅透出 Gateway 需要的字段；避免把完整行传入上游造成耦合。
 */
export interface ResolvedProjectKey {
  readonly projectId: string;
  readonly publicKey: string;
}

/** 内存缓存条目：publicKey → 解析结果 | null（命中未启用项目） */
interface CacheEntry {
  readonly value: ResolvedProjectKey | null;
  readonly expiresAt: number;
}

/**
 * 根据 DSN publicKey 解析活跃项目（Gateway 鉴权入口）
 *
 * 查询规则：`project_keys.is_active = true` AND `projects.is_active = true`
 * 缓存：60s 内存 TTL；命中失败也缓存（负命中）避免打垮 DB
 *
 * 架构：
 * - db=null（test / 未就绪）→ `resolve()` 直接返回 null；Guard 侧按 bypass 放行
 * - 正式环境：走 partial index `idx_project_keys_public`（WHERE is_active=true）
 */
@Injectable()
export class ProjectKeysService {
  private readonly logger = new Logger(ProjectKeysService.name);
  private readonly cache = new Map<string, CacheEntry>();
  /** 缓存 TTL 60s —— SDK 轮询频繁、key 变更低频，命中率优先 */
  private static readonly TTL_MS = 60_000;
  /** 缓存上限：超过后按 FIFO 清空；生产通常只活跃数十个 key */
  private static readonly MAX_ENTRIES = 1000;

  public constructor(private readonly database: DatabaseService) {}

  /**
   * 解析 publicKey → 活跃 project_key 行
   *
   * 返回 null 的 3 种情况：DB 未就绪 / key 不存在 / key 或 project 已禁用
   */
  public async resolve(publicKey: string): Promise<ResolvedProjectKey | null> {
    if (typeof publicKey !== "string" || publicKey.length === 0) return null;

    const cached = this.cache.get(publicKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const db = this.database.db;
    if (!db) return null;

    const rows = await db.execute<{
      project_id: string;
      public_key: string;
    }>(sql`
      SELECT k.project_id, k.public_key
      FROM project_keys k
      INNER JOIN projects p ON p.id = k.project_id
      WHERE k.public_key = ${publicKey}
        AND k.is_active = true
        AND p.is_active = true
      LIMIT 1
    `);
    const row = rows[0];
    const value: ResolvedProjectKey | null = row
      ? { projectId: row.project_id, publicKey: row.public_key }
      : null;
    this.setCache(publicKey, value);
    return value;
  }

  /** 测试接口：清空缓存（避免单测间串味） */
  public clearCache(): void {
    this.cache.clear();
  }

  private setCache(key: string, value: ResolvedProjectKey | null): void {
    if (this.cache.size >= ProjectKeysService.MAX_ENTRIES) {
      // 简化策略：到顶即清空，避免单独引入 LRU 依赖
      this.cache.clear();
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ProjectKeysService.TTL_MS,
    });
  }
}
