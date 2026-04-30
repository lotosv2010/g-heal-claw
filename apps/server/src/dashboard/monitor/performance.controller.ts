import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardPerformanceService } from "./performance.service.js";
import {
  OverviewQuerySchema,
  type OverviewQuery,
  type PerformanceOverviewDto,
} from "../dto/overview.dto.js";

/**
 * Dashboard 性能大盘 API（ADR-0015）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/performance")
export class DashboardPerformanceController {
  public constructor(private readonly service: DashboardPerformanceService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(OverviewQuerySchema))
  @ApiOperation({ summary: "性能大盘总览：Vitals p75 + 24h 趋势 + 瀑布图 + 慢页面 Top N" })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({ name: "windowHours", required: false, type: Number, example: 24 })
  @ApiQuery({ name: "limitSlowPages", required: false, type: Number, example: 10 })
  @ApiOkResponse({ description: "聚合数据；空数据时 vitals sampleCount=0" })
  public async getOverview(
    @Query() query: OverviewQuery,
  ): Promise<{ data: PerformanceOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
