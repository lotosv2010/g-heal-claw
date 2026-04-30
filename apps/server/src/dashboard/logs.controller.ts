import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../shared/pipes/zod-validation.pipe.js";
import { DashboardLogsService } from "./logs.service.js";
import {
  LogsOverviewQuerySchema,
  type LogsOverviewDto,
  type LogsOverviewQuery,
} from "./dto/logs-overview.dto.js";

/**
 * Dashboard Logs 大盘 API（ADR-0023 §4 / TM.1.C.4）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/logs")
export class DashboardLogsController {
  public constructor(private readonly service: DashboardLogsService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(LogsOverviewQuerySchema))
  @ApiOperation({
    summary:
      "自定义日志大盘总览：summary（总数/三级别计数/错误率/环比）+ 3 级别分桶 + 三折线趋势 + Top message",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({ name: "windowHours", required: false, type: Number, example: 24 })
  @ApiQuery({
    name: "limitMessages",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiOkResponse({
    description: "聚合数据；空窗口时 levelBuckets 固定 3 占位 count=0",
  })
  public async getOverview(
    @Query() query: LogsOverviewQuery,
  ): Promise<{ data: LogsOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
