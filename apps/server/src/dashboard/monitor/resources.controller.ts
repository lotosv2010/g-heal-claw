import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardResourcesService } from "./resources.service.js";
import {
  ResourcesOverviewQuerySchema,
  type ResourcesOverviewDto,
  type ResourcesOverviewQuery,
} from "../dto/resources-overview.dto.js";

/**
 * Dashboard Resources 大盘 API（ADR-0022 §4 / TM.1.B.4）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/resources")
export class DashboardResourcesController {
  public constructor(private readonly service: DashboardResourcesService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(ResourcesOverviewQuerySchema))
  @ApiOperation({
    summary:
      "静态资源大盘总览：summary（样本/失败/慢/p75/传输字节/环比）+ 6 类分桶 + 小时趋势 + Top 慢资源 + Top 失败 host",
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
    name: "limitHosts",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiOkResponse({
    description:
      "聚合数据；空窗口时 categoryBuckets 固定 6 占位 count=0，其他数组可能为空",
  })
  public async getOverview(
    @Query() query: ResourcesOverviewQuery,
  ): Promise<{ data: ResourcesOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
