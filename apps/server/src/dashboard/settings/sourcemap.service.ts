import { Inject, Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { generateReleaseId, generateArtifactId } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { STORAGE_SERVICE, type StorageService } from "../../modules/sourcemap/storage.service.js";

/**
 * Dashboard Sourcemap 代理层
 *
 * 薄装配：直查 releases / release_artifacts 表，供管理页面使用。
 * 同时提供 JWT 鉴权的上传通道（createRelease + uploadArtifact），
 * 使前端无需持有 secretKey 即可完成 Sourcemap 上传。
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
        SELECT release_id, COUNT(*)::int AS cnt
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

  /** 创建 Release（幂等：version 已存在时返回现有记录） */
  public async createRelease(
    projectId: string,
    version: string,
    commitSha?: string,
  ): Promise<{ id: string; version: string; commitSha: string | null; createdAt: string }> {
    const db = this.database.db;
    if (!db) {
      return { id: "rel_test", version, commitSha: commitSha ?? null, createdAt: new Date().toISOString() };
    }

    const existing = await db.execute<{
      id: string; version: string; commit_sha: string | null; created_at: string;
    }>(sql`
      SELECT id, version, commit_sha, created_at
      FROM releases
      WHERE project_id = ${projectId} AND version = ${version}
      LIMIT 1
    `);

    if (existing.length > 0) {
      const row = existing[0]!;
      return { id: row.id, version: row.version, commitSha: row.commit_sha, createdAt: new Date(row.created_at).toISOString() };
    }

    const id = generateReleaseId();
    await db.execute(sql`
      INSERT INTO releases (id, project_id, version, commit_sha, notes, created_at)
      VALUES (${id}, ${projectId}, ${version}, ${commitSha ?? null}, ${null}, NOW())
    `);

    this.logger.log(`Release created via dashboard: id=${id} project=${projectId} version=${version}`);
    return { id, version, commitSha: commitSha ?? null, createdAt: new Date().toISOString() };
  }

  /** 上传 Artifact（UPSERT：同 filename 覆盖） */
  public async uploadArtifact(
    projectId: string,
    releaseId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<{ id: string; filename: string; mapFilename: string; fileSize: number; createdAt: string } | null> {
    const db = this.database.db;

    // 验证 release 存在且属于当前项目
    if (db) {
      const check = await db.execute<{ id: string }>(sql`
        SELECT id FROM releases WHERE id = ${releaseId} AND project_id = ${projectId} LIMIT 1
      `);
      if (check.length === 0) return null;
    }

    const mapFilename = filename.endsWith(".map") ? filename : `${filename}.map`;
    const storageKey = `sourcemaps/${projectId}/${releaseId}/${mapFilename}`;

    await this.storage.put(storageKey, fileBuffer, "application/json");

    if (!db) {
      return { id: "art_test", filename, mapFilename, fileSize: fileBuffer.length, createdAt: new Date().toISOString() };
    }

    const artId = generateArtifactId();
    await db.execute(sql`
      INSERT INTO release_artifacts (id, release_id, project_id, filename, map_filename, storage_key, file_size, created_at)
      VALUES (${artId}, ${releaseId}, ${projectId}, ${filename}, ${mapFilename}, ${storageKey}, ${fileBuffer.length}, NOW())
      ON CONFLICT (release_id, filename)
      DO UPDATE SET
        map_filename = EXCLUDED.map_filename,
        storage_key  = EXCLUDED.storage_key,
        file_size    = EXCLUDED.file_size,
        created_at   = NOW()
    `);

    this.logger.log(`Artifact uploaded via dashboard: release=${releaseId} file=${mapFilename} size=${fileBuffer.length}`);
    return { id: artId, filename, mapFilename, fileSize: fileBuffer.length, createdAt: new Date().toISOString() };
  }
}
