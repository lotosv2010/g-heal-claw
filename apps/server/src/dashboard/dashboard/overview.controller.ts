import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardOverviewService } from "./overview.service.js";
import {
  OverviewSummaryQuerySchema,
  type OverviewSummaryDto,
  type OverviewSummaryQuery,
} from "./dto/overview-summary.dto.js";

/**
 * 数据总览大盘 API（ADR-0029）
 *
 * - 5 域并发聚合（Promise.allSettled，单域失败不影响整体）
 * - 全站健康度由服务端权威计算，前端不做业务计算
 * - 无 RBAC（T1.1.7 未交付），沿用 `NEXT_PUBLIC_DEFAULT_PROJECT_ID`
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/overview")
export class DashboardOverviewController {
  public constructor(private readonly service: DashboardOverviewService) {}

  @Get("summary")
  @UsePipes(new ZodValidationPipe(OverviewSummaryQuerySchema))
  @ApiOperation({
    summary:
      "数据总览：5 域 summary（errors/performance/api/resources/visits）+ 全站健康度",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({ name: "windowHours", required: false, type: Number, example: 24 })
  @ApiOkResponse({
    description:
      "每域独立 source（live/empty/error）；health.score=null 表示全域无样本",
  })
  public async getSummary(
    @Query() query: OverviewSummaryQuery,
  ): Promise<{ data: OverviewSummaryDto }> {
    const data = await this.service.getSummary(query);
    return { data };
  }
}
