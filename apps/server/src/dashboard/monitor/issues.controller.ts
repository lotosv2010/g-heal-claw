import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../modules/auth/project.guard.js";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardIssuesService } from "./issues.service.js";
import {
  IssuesListQuerySchema,
  IssueStatusUpdateSchema,
  type IssueDetailDto,
  type IssueListItemDto,
  type IssuesListQuery,
  type IssueStatusUpdate,
} from "../dto/issues.dto.js";

/**
 * Dashboard Issues API（T1.6.2 ~ T1.6.6）
 *
 * 提供 Issues 列表、详情、状态变更端点。
 */
@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("dashboard/v1/issues")
export class DashboardIssuesController {
  public constructor(private readonly service: DashboardIssuesService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(IssuesListQuerySchema))
  @ApiOperation({ summary: "Issues 列表（分页 + 筛选 + 排序）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "subType", required: false, type: String })
  @ApiQuery({ name: "sort", required: false, type: String })
  @ApiQuery({ name: "order", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  public async list(
    @Query() query: IssuesListQuery,
  ): Promise<{
    data: IssueListItemDto[];
    pagination: { page: number; limit: number; total: number };
  }> {
    const { items, total } = await this.service.list(query);
    return {
      data: items,
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  @Get(":issueId")
  @ApiOperation({ summary: "Issue 详情（含近期事件样本）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async detail(
    @Param("issueId") issueId: string,
    @Query("projectId") projectId: string,
  ): Promise<{ data: IssueDetailDto }> {
    const detail = await this.service.getDetail(issueId, projectId);
    if (!detail) {
      throw new NotFoundException(`Issue ${issueId} 未找到`);
    }
    return { data: detail };
  }

  @Patch(":issueId/status")
  @HttpCode(200)
  @ApiOperation({ summary: "变更 Issue 状态（open / resolved / ignored）" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  public async updateStatus(
    @Param("issueId") issueId: string,
    @Query("projectId") projectId: string,
    @Body(new ZodValidationPipe(IssueStatusUpdateSchema)) body: IssueStatusUpdate,
  ): Promise<{ data: { success: boolean } }> {
    const ok = await this.service.updateStatus(issueId, projectId, body.status);
    if (!ok) {
      throw new NotFoundException(`Issue ${issueId} 未找到`);
    }
    return { data: { success: true } };
  }
}
