import { Controller, Get, Query, UsePipes } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { DashboardRetentionService } from "./retention.service.js";
import {
  RetentionOverviewQuerySchema,
  type RetentionOverviewDto,
  type RetentionOverviewQuery,
} from "../dto/tracking-retention.dto.js";

/**
 * Dashboard 用户留存大盘 API（ADR-0028 / tracking/retention 切片）
 *
 * 只读视图层：`page_view_raw` → VisitsService.aggregateRetention → 装配层计算留存率。
 * 零新表 / 零 SDK / 零 RBAC 依赖；cohort 窗口与观察期由 URL query 传入，天然可分享。
 *
 * 注：聚合方法位于 VisitsService（ADR-0025 模块边界：page_view_raw 归 VisitsService），
 *     Controller 仍挂在 tracking/ 用户视角菜单，形成 domain=Visits / presentation=Tracking。
 */
@ApiTags("dashboard")
@Controller("dashboard/v1/tracking/retention")
export class DashboardRetentionController {
  public constructor(
    private readonly service: DashboardRetentionService,
  ) {}

  @Get()
  @UsePipes(new ZodValidationPipe(RetentionOverviewQuerySchema))
  @ApiOperation({
    summary:
      "留存矩阵：cohort × day_offset；identity=session|user 切换；返回三态 source (live/empty/error)",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "cohortDays",
    required: false,
    type: Number,
    example: 7,
  })
  @ApiQuery({
    name: "returnDays",
    required: false,
    type: Number,
    example: 7,
  })
  @ApiQuery({
    name: "identity",
    required: false,
    enum: ["session", "user"],
    example: "session",
  })
  @ApiQuery({ name: "since", required: false, type: String })
  @ApiQuery({ name: "until", required: false, type: String })
  @ApiOkResponse({
    description:
      "留存聚合：按 cohortDate 升序返回矩阵 + 跨 cohort 加权平均；参数非法由 Zod 400；空数据 source=empty",
  })
  public async getOverview(
    @Query() query: RetentionOverviewQuery,
  ): Promise<{ data: RetentionOverviewDto }> {
    const data = await this.service.getOverview(query);
    return { data };
  }
}
