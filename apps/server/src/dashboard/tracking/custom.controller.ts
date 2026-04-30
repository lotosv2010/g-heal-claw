import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardCustomService } from "./custom.service.js";
import {
  CustomOverviewQuerySchema,
  type CustomOverviewDto,
  type CustomOverviewQuery,
} from "../dto/custom-overview.dto.js";

/**
 * Dashboard Custom 大盘 API（ADR-0023 §4 / TM.1.C.4）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/custom")
export class DashboardCustomController {
  public constructor(private readonly service: DashboardCustomService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(CustomOverviewQuerySchema))
  @ApiOperation({
    summary:
      "自定义上报大盘总览：事件/指标双 summary + 环比 + 双 TopN + 双轨趋势 + topPages",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({ name: "windowHours", required: false, type: Number, example: 24 })
  @ApiQuery({
    name: "limitEvents",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({
    name: "limitMetrics",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiQuery({ name: "limitPages", required: false, type: Number, example: 10 })
  @ApiOkResponse({
    description: "聚合数据；空窗口时 topN / trend / pages 为空数组",
  })
  public async getOverview(
    @Query() query: CustomOverviewQuery,
  ): Promise<{ data: CustomOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
