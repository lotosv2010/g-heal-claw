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
import { DashboardErrorsService } from "./errors.service.js";
import {
  ErrorsOverviewQuerySchema,
  type ErrorOverviewDto,
  type ErrorsOverviewQuery,
} from "../dto/errors-overview.dto.js";

/**
 * Dashboard 异常大盘 API（ADR-0016 §3）
 *
 * 本期仅面向 Web 前端；鉴权 / 项目隔离交给 T1.1.7。
 */
@ApiTags("dashboard")
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("dashboard/v1/errors")
export class DashboardErrorsController {
  public constructor(private readonly service: DashboardErrorsService) {}

  @Get("overview")
  @UsePipes(new ZodValidationPipe(ErrorsOverviewQuerySchema))
  @ApiOperation({
    summary:
      "异常大盘总览：summary（总事件数/影响会话/环比）+ bySubType 占比 + 24h 趋势 + Top groups",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "windowHours",
    required: false,
    type: Number,
    example: 24,
  })
  @ApiQuery({
    name: "limitGroups",
    required: false,
    type: Number,
    example: 10,
  })
  @ApiOkResponse({
    description: "聚合数据；空数据时 bySubType 补齐 5 占位，trend/topGroups 为空数组",
  })
  public async getOverview(
    @Query() query: ErrorsOverviewQuery,
  ): Promise<{ data: ErrorOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
