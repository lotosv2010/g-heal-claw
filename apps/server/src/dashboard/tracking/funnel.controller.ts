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
import { DashboardFunnelService } from "./funnel.service.js";
import {
  FunnelOverviewQuerySchema,
  type FunnelOverviewDto,
  type FunnelOverviewQuery,
} from "../dto/tracking-funnel.dto.js";

/**
 * Dashboard 漏斗大盘 API（ADR-0027 / tracking/funnel 切片）
 *
 * 只读视图层：`track_events_raw` → TrackingService.aggregateFunnel → 装配层计算比例。
 * 零新表 / 零 SDK / 零 RBAC 依赖；漏斗定义由 URL steps CSV 传入，天然可分享。
 */
@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("dashboard/v1/tracking/funnel")
export class DashboardFunnelController {
  public constructor(private readonly service: DashboardFunnelService) {}

  @Get()
  @UsePipes(new ZodValidationPipe(FunnelOverviewQuerySchema))
  @ApiOperation({
    summary:
      "漏斗总览：N 步（2~8）严格顺序命中，用户级 COALESCE(user_id,session_id) 去重；步长 ≤ stepWindowMinutes",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "steps",
    required: true,
    type: String,
    example: "view_home,click_cta,submit_form",
  })
  @ApiQuery({
    name: "stepWindowMinutes",
    required: false,
    type: Number,
    example: 60,
  })
  @ApiOkResponse({
    description:
      "漏斗聚合数据；首步 0 → 全部比例 0；末步 0 → 仅该步比例 0（步长不短路）",
  })
  public async getOverview(
    @Query() query: FunnelOverviewQuery,
  ): Promise<{ data: FunnelOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
