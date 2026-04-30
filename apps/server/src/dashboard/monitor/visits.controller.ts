import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardVisitsService } from "./visits.service.js";
import {
  VisitsOverviewQuerySchema,
  type VisitsOverviewDto,
  type VisitsOverviewQuery,
} from "../dto/visits-overview.dto.js";

/**
 * Dashboard Visits 大盘 API（ADR-0020 Tier 2.A）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/visits")
export class DashboardVisitsController {
  public constructor(private readonly service: DashboardVisitsService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(VisitsOverviewQuerySchema))
  @ApiOperation({
    summary:
      "Visits 大盘总览：summary（PV/UV/SPA占比/刷新占比/环比）+ 小时趋势 + TopPages + TopReferrers",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "limitPages",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitReferrers",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiOkResponse({
    description:
      "聚合数据；空窗口时 trend / topPages / topReferrers 均为空数组",
  })
  public async getOverview(
    @Query() query: VisitsOverviewQuery,
  ): Promise<{ data: VisitsOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
