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
import { DashboardTrackingService } from "./tracking.service.js";
import {
  TrackingOverviewQuerySchema,
  type TrackingOverviewDto,
  type TrackingOverviewQuery,
} from "../dto/tracking-overview.dto.js";

/**
 * Dashboard 埋点大盘 API（P0-3 §2）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("dashboard/v1/tracking")
export class DashboardTrackingController {
  public constructor(private readonly service: DashboardTrackingService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(TrackingOverviewQuerySchema))
  @ApiOperation({
    summary:
      "埋点大盘总览：summary（事件/用户/session/事件名/环比）+ 类型桶 + 小时趋势 + Top 事件 + Top 页面",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "limitEvents",
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
  @ApiOkResponse({
    description:
      "聚合数据；空窗口时 typeBuckets 补齐 4 占位，trend / topEvents / topPages 均可能为空数组",
  })
  public async getOverview(
    @Query() query: TrackingOverviewQuery,
  ): Promise<{ data: TrackingOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
