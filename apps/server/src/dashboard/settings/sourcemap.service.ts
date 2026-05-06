import { Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../../shared/database/database.service.js";
import { STORAGE_SERVICE, type StorageService } from "../../modules/sourcemap/storage.service.js";
import { Inject } from "@nestjs/common";

/**
 * Dashboard Sourcemap 代理层（ADR-0033 §1）
 *
 * 薄装配：直查 releases / release_artifacts 表，仅供管理页面使用。
 * 上传仍走 SourcemapController（X-Api-Key），此处只提供查看和删除。
 */
@Injectable()
export class DashboardSourcemapService {
  private readonly logger = new Logger(DashboardSourcemapService.name);

  public constructor(
    private readonly database: DatabaseService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  public async listReleases(projectId: string): Promise<readonly Record<string, unknown>[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      version: string;
      commit_sha: string | null;
      artifact_count: string;
      created_at: string;
    }>(sql`
      SELECT
        r.id,
        r.version,
        r.commit_sha,
        COALESCE(a.cnt, 0) AS artifact_count,
        r.created_at
      FROM releases r
      LEFT JOIN (
        SELECT release_id, COUNT(*)::text AS cnt
        FROM release_artifacts
        WHERE project_id = ${projectId}
        GROUP BY release_id
      ) a ON a.release_id = r.id
      WHERE r.project_id = ${projectId}
      ORDER BY r.created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      commitSha: r.commit_sha,
      artifactCount: Number(r.artifact_count),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  public async listArtifacts(
    projectId: string,
    releaseId: string,
  ): Promise<readonly Record<string, unknown>[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      filename: string;
      map_filename: string;
      file_size: number;
      created_at: string;
    }>(sql`
      SELECT id, filename, map_filename, file_size, created_at
      FROM release_artifacts
      WHERE release_id = ${releaseId} AND project_id = ${projectId}
      ORDER BY created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mapFilename: r.map_filename,
      fileSize: Number(r.file_size),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  public async deleteRelease(projectId: string, releaseId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    // 验证 release 属于当前项目
    const check = await db.execute<{ id: string }>(sql`
      SELECT id FROM releases
      WHERE id = ${releaseId} AND project_id = ${projectId}
      LIMIT 1
    `);
    if (check.length === 0) return false;

    // 清理 MinIO 对象
    const prefix = `sourcemaps/${projectId}/${releaseId}/`;
    const deletedCount = await this.storage.deletePrefix(prefix);

    // DB 级联删除
    await db.execute(sql`
      DELETE FROM releases
      WHERE id = ${releaseId} AND project_id = ${projectId}
    `);

    this.logger.log(
      `Release deleted via dashboard: id=${releaseId} project=${projectId} storageObjects=${deletedCount}`,
    );
    return true;
  }
}
