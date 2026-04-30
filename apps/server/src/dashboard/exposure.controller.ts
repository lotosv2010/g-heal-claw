import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../shared/pipes/zod-validation.pipe.js";
import { DashboardExposureService } from "./exposure.service.js";
import {
  ExposureOverviewQuerySchema,
  type ExposureOverviewDto,
  type ExposureOverviewQuery,
} from "./dto/exposure-overview.dto.js";

/**
 * Dashboard 曝光大盘 API（ADR-0024 / tracking/exposure 切片）
 *
 * 本端点仅 Web 读取；数据源复用 `track_events_raw` 中 `track_type='expose'`
 * 子集，不新增 schema / 队列 / SDK 能力。鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/tracking/exposure")
export class DashboardExposureController {
  public constructor(private readonly service: DashboardExposureService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(ExposureOverviewQuerySchema))
  @ApiOperation({
    summary:
      "曝光大盘总览：summary（曝光/元素/页面/用户/环比）+ 小时趋势 + Top 元素 + Top 页面",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "limitSelectors",
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
      "曝光聚合数据；空窗口 summary 全 0、trend/topSelectors/topPages 返回空数组",
  })
  public async getOverview(
    @Query() query: ExposureOverviewQuery,
  ): Promise<{ data: ExposureOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
