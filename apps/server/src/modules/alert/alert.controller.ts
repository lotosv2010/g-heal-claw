import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ProjectGuard } from "../auth/project.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { AlertService } from "./alert.service.js";
import {
  CreateAlertRuleSchema,
  type CreateAlertRuleInput,
} from "./dto/create-alert-rule.dto.js";
import {
  UpdateAlertRuleSchema,
  type UpdateAlertRuleInput,
} from "./dto/update-alert-rule.dto.js";
import {
  AlertHistoryQuerySchema,
  type AlertHistoryQuery,
} from "./dto/alert-history-query.dto.js";

@ApiTags("alert-rules")
@Controller("api/v1/projects/:projectId/alert-rules")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class AlertController {
  public constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: "列出项目下所有告警规则" })
  public async listRules(@Param("projectId") projectId: string) {
    const items = await this.alertService.listRules(projectId);
    return { data: items };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @UsePipes(new ZodValidationPipe(CreateAlertRuleSchema))
  @ApiOperation({ summary: "创建告警规则（admin+）" })
  public async createRule(
    @Param("projectId") projectId: string,
    @Body() body: CreateAlertRuleInput,
  ) {
    const rule = await this.alertService.createRule(projectId, body);
    return { data: rule };
  }

  @Patch(":ruleId")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @UsePipes(new ZodValidationPipe(UpdateAlertRuleSchema))
  @ApiOperation({ summary: "更新告警规则（admin+）" })
  public async updateRule(
    @Param("ruleId") ruleId: string,
    @Body() body: UpdateAlertRuleInput,
  ) {
    const rule = await this.alertService.updateRule(ruleId, body);
    return { data: rule };
  }

  @Patch(":ruleId/toggle")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "切换告警规则启用/禁用（admin+）" })
  public async toggleEnabled(
    @Param("ruleId") ruleId: string,
    @Body("enabled") enabled: boolean,
  ) {
    const success = await this.alertService.toggleEnabled(ruleId, enabled);
    if (!success) {
      throw new NotFoundException({
        error: "ALERT_RULE_NOT_FOUND",
        message: "告警规则不存在",
      });
    }
    return { data: { ruleId, enabled } };
  }

  @Delete(":ruleId")
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "删除告警规则（admin+）" })
  public async deleteRule(@Param("ruleId") ruleId: string) {
    const deleted = await this.alertService.deleteRule(ruleId);
    if (!deleted) {
      throw new NotFoundException({
        error: "ALERT_RULE_NOT_FOUND",
        message: "告警规则不存在",
      });
    }
  }

  @Get("history")
  @ApiOperation({ summary: "查询告警历史（分页）" })
  public async listHistory(
    @Param("projectId") projectId: string,
    @Query("ruleId") ruleId?: string,
    @Query("status") status?: "firing" | "resolved",
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const query: AlertHistoryQuery = AlertHistoryQuerySchema.parse({
      projectId,
      ruleId,
      status,
      limit,
      offset,
    });

    const { data, total } = await this.alertService.listHistory(query);
    return {
      data,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
      },
    };
  }
}
