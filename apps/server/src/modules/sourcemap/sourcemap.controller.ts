import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { generateArtifactId, generateReleaseId } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { ApiKeyGuard, type ApiKeyAuthedRequest } from "./api-key.guard.js";
import { CreateReleaseSchema, type CreateReleaseDto } from "./dto/create-release.dto.js";
import { UploadArtifactQuerySchema } from "./dto/upload-artifact.dto.js";
import {
  STORAGE_SERVICE,
  type StorageService,
} from "./storage.service.js";
import { Inject } from "@nestjs/common";

/**
 * Sourcemap Release + Artifact CRUD（ADR-0031 §3）
 *
 * 鉴权：X-Api-Key → project_keys.secret_key
 */
@ApiTags("sourcemap")
@Controller("sourcemap/v1")
@UseGuards(ApiKeyGuard)
export class SourcemapController {
  private readonly logger = new Logger(SourcemapController.name);

  public constructor(
    private readonly database: DatabaseService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------------
  // POST /sourcemap/v1/releases — 创建或获取 Release（幂等）
  // ------------------------------------------------------------------
  @Post("releases")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "创建 Release（幂等，version 已存在时返回现有记录）" })
  public async createRelease(
    @Req() req: ApiKeyAuthedRequest,
  ): Promise<{ data: Record<string, unknown> }> {
    const body = req.body as Record<string, unknown> | undefined;
    const parsed = CreateReleaseSchema.safeParse(body);
    if (!parsed.success) {
      return { data: { error: "VALIDATION_FAILED", details: parsed.error.issues } } as never;
    }
    const dto: CreateReleaseDto = parsed.data;
    const projectId = req.apiKeyAuth!.projectId;
    const db = this.database.db;
    if (!db) {
      return {
        data: {
          id: "rel_test",
          projectId,
          version: dto.version,
          commitSha: dto.commitSha ?? null,
          createdAt: new Date().toISOString(),
        },
      };
    }

    // 幂等：(project_id, version) 已存在时返回现有
    const existing = await db.execute<{
      id: string;
      project_id: string;
      version: string;
      commit_sha: string | null;
      created_at: string;
    }>(sql`
      SELECT id, project_id, version, commit_sha, created_at
      FROM releases
      WHERE project_id = ${projectId} AND version = ${dto.version}
      LIMIT 1
    `);

    if (existing.length > 0) {
      const row = existing[0];
      return {
        data: {
          id: row.id,
          projectId: row.project_id,
          version: row.version,
          commitSha: row.commit_sha,
          createdAt: new Date(row.created_at).toISOString(),
        },
      };
    }

    const id = generateReleaseId();
    await db.execute(sql`
      INSERT INTO releases (id, project_id, version, commit_sha, notes, created_at)
      VALUES (${id}, ${projectId}, ${dto.version}, ${dto.commitSha ?? null}, ${dto.notes ?? null}, NOW())
    `);

    this.logger.log(
      `Release created id=${id} project=${projectId} version=${dto.version}`,
    );

    return {
      data: {
        id,
        projectId,
        version: dto.version,
        commitSha: dto.commitSha ?? null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // ------------------------------------------------------------------
  // POST /sourcemap/v1/releases/:releaseId/artifacts — 上传 .map 文件
  // ------------------------------------------------------------------
  @Post("releases/:releaseId/artifacts")
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "上传 Sourcemap artifact（multipart，单文件 ≤ 50MB）" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "原始 JS 文件名" },
        file: { type: "string", format: "binary" },
      },
    },
  })
  public async uploadArtifact(
    @Param("releaseId") releaseId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ data: Record<string, unknown> }> {
    const projectId = (req as ApiKeyAuthedRequest).apiKeyAuth!.projectId;

    // 解析 multipart
    const parts = req.parts();
    let filename: string | undefined;
    let fileBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "filename") {
        filename = String(part.value);
      } else if (part.type === "file" && part.fieldname === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk as Buffer);
        }
        fileBuffer = Buffer.concat(chunks);
      }
    }

    // 参数校验
    const filenameResult = UploadArtifactQuerySchema.safeParse({ filename });
    if (!filenameResult.success || !fileBuffer || fileBuffer.length === 0) {
      reply.code(HttpStatus.BAD_REQUEST);
      return {
        data: {
          error: "VALIDATION_FAILED",
          message: "filename 和 file 字段必填",
        },
      };
    }
    filename = filenameResult.data.filename;

    const mapFilename = filename.endsWith(".map")
      ? filename
      : `${filename}.map`;
    const storageKey = `sourcemaps/${projectId}/${releaseId}/${mapFilename}`;

    // 存储到 MinIO
    await this.storage.put(storageKey, fileBuffer, "application/json");

    const db = this.database.db;
    if (!db) {
      return {
        data: {
          id: "art_test",
          filename,
          mapFilename,
          fileSize: fileBuffer.length,
          createdAt: new Date().toISOString(),
        },
      };
    }

    // 验证 release 存在且属于当前项目
    const releaseCheck = await db.execute<{ id: string }>(sql`
      SELECT id FROM releases
      WHERE id = ${releaseId} AND project_id = ${projectId}
      LIMIT 1
    `);
    if (releaseCheck.length === 0) {
      reply.code(HttpStatus.NOT_FOUND);
      return {
        data: { error: "RELEASE_NOT_FOUND", message: "Release 不存在或无权访问" },
      };
    }

    // UPSERT：同 (release_id, filename) 覆盖旧记录
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

    this.logger.log(
      `Artifact uploaded release=${releaseId} filename=${filename} size=${fileBuffer.length}`,
    );

    return {
      data: {
        id: artId,
        filename,
        mapFilename,
        fileSize: fileBuffer.length,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // ------------------------------------------------------------------
  // GET /sourcemap/v1/releases/:releaseId/artifacts — 列出 artifacts
  // ------------------------------------------------------------------
  @Get("releases/:releaseId/artifacts")
  @ApiOperation({ summary: "列出 Release 下所有 Artifacts" })
  public async listArtifacts(
    @Param("releaseId") releaseId: string,
    @Req() req: ApiKeyAuthedRequest,
  ): Promise<{ data: Record<string, unknown>[] }> {
    const projectId = req.apiKeyAuth!.projectId;
    const db = this.database.db;

    if (!db) {
      return { data: [] };
    }

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

    return {
      data: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mapFilename: r.map_filename,
        fileSize: Number(r.file_size),
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  }

  // ------------------------------------------------------------------
  // DELETE /sourcemap/v1/releases/:releaseId — 删除 Release（级联）
  // ------------------------------------------------------------------
  @Delete("releases/:releaseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "删除 Release（级联删除 artifacts + MinIO 对象）" })
  public async deleteRelease(
    @Param("releaseId") releaseId: string,
    @Req() req: ApiKeyAuthedRequest,
  ): Promise<void> {
    const projectId = req.apiKeyAuth!.projectId;
    const db = this.database.db;

    if (!db) return;

    // 先删 MinIO 对象
    const prefix = `sourcemaps/${projectId}/${releaseId}/`;
    const deletedCount = await this.storage.deletePrefix(prefix);

    // DB 级联删除（FK ON DELETE CASCADE 自动删 artifacts）
    await db.execute(sql`
      DELETE FROM releases
      WHERE id = ${releaseId} AND project_id = ${projectId}
    `);

    this.logger.log(
      `Release deleted id=${releaseId} project=${projectId} storageObjects=${deletedCount}`,
    );
  }
}
