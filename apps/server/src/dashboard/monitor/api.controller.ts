import { Controller, Get, Query, UseGuards, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../modules/auth/project.guard.js";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardApiService } from "./api.service.js";
import {
  ApiOverviewQuerySchema,
  type ApiOverviewDto,
  type ApiOverviewQuery,
} from "../dto/api-overview.dto.js";

/**
 * Dashboard API 大盘 API（ADR-0020 §4.2 / TM.1.A.4）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("dashboard/v1/api")
export class DashboardApiController {
  public constructor(private readonly service: DashboardApiService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(ApiOverviewQuerySchema))
  @ApiOperation({
    summary:
      "API 大盘总览：summary（样本/慢占比/失败率/p75/环比）+ 状态码桶 + 小时趋势 + Top 慢请求",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "limitSlow",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitTop",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitPages",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitErrorStatus",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitDimension",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiOkResponse({
    description:
      "聚合数据；空窗口时 statusBuckets 补齐 5 占位，trend / topSlow / topRequests / topPages / topErrorStatus 均可能为空数组",
  })
  public async getOverview(
    @Query() query: ApiOverviewQuery,
  ): Promise<{ data: ApiOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
