import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../modules/auth/project.guard.js";
import { RolesGuard } from "../../modules/auth/roles.guard.js";
import { Roles } from "../../modules/auth/roles.decorator.js";
import { DashboardSourcemapService } from "./sourcemap.service.js";

/**
 * Dashboard Sourcemap 管理代理（ADR-0033 §1）
 *
 * 前端统一走 JWT 鉴权查看/删除 Release + Artifact。
 * 上传仍走 /sourcemap/v1（X-Api-Key），此处不提供上传端点。
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
}
