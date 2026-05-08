import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../modules/auth/project.guard.js";
import { RolesGuard } from "../../modules/auth/roles.guard.js";
import { Roles } from "../../modules/auth/roles.decorator.js";
import { DashboardSourcemapService } from "./sourcemap.service.js";

/**
 * Dashboard Sourcemap 管理代理
 *
 * 前端统一走 JWT 鉴权管理 Release + Artifact（含上传）。
 */
@ApiTags("dashboard-settings")
@Controller("dashboard/v1/settings/sourcemaps")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class DashboardSourcemapController {
  public constructor(private readonly service: DashboardSourcemapService) {}

  @Get("releases")
  @ApiOperation({ summary: "列出项目所有 Release（含 artifact 计数）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async listReleases(@Query("projectId") projectId: string) {
    const items = await this.service.listReleases(projectId);
    return { data: items };
  }

  @Get("releases/:releaseId/artifacts")
  @ApiOperation({ summary: "列出 Release 下所有 Artifacts" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async listArtifacts(
    @Param("releaseId") releaseId: string,
    @Query("projectId") projectId: string,
  ) {
    const items = await this.service.listArtifacts(projectId, releaseId);
    return { data: items };
  }

  @Delete("releases/:releaseId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "删除 Release（级联删除 artifacts + MinIO，admin+）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async deleteRelease(
    @Param("releaseId") releaseId: string,
    @Query("projectId") projectId: string,
  ) {
    const deleted = await this.service.deleteRelease(projectId, releaseId);
    if (!deleted) {
      throw new NotFoundException({
        error: "RELEASE_NOT_FOUND",
        message: "Release 不存在或无权访问",
      });
    }
  }

  @Post("releases")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "创建 Release（幂等，version 已存在时返回现有记录）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async createRelease(
    @Query("projectId") projectId: string,
    @Req() req: FastifyRequest,
  ) {
    const body = req.body as Record<string, unknown> | undefined;
    const version = String(body?.version ?? "").trim();
    if (!version) {
      throw new BadRequestException({ error: "VALIDATION_FAILED", message: "version 必填" });
    }
    const commitSha = body?.commitSha ? String(body.commitSha).trim() : undefined;
    const result = await this.service.createRelease(projectId, version, commitSha);
    return { data: result };
  }

  @Post("releases/:releaseId/artifacts")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "上传 Sourcemap 文件（multipart，≤ 50MB）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
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
    @Query("projectId") projectId: string,
    @Req() req: FastifyRequest,
  ) {
    const parts = req.parts();
    let filename: string | undefined;
    let fileBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "filename") {
        filename = String(part.value).trim();
      } else if (part.type === "file" && part.fieldname === "file") {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk as Buffer);
        }
        fileBuffer = Buffer.concat(chunks);
      }
    }

    if (!filename || !fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException({ error: "VALIDATION_FAILED", message: "filename 和 file 字段必填" });
    }

    const result = await this.service.uploadArtifact(projectId, releaseId, filename, fileBuffer);
    if (!result) {
      throw new NotFoundException({ error: "RELEASE_NOT_FOUND", message: "Release 不存在或无权访问" });
    }
    return { data: result };
  }
}
