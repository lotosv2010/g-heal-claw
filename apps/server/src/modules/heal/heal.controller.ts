import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ProjectGuard } from "../auth/project.guard.js";
import { HealService } from "./heal.service.js";
import { TriggerHealSchema, HealJobQuerySchema, type TriggerHealDto } from "./dto/heal.dto.js";

@ApiTags("Heal")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProjectGuard)
@Controller("api/v1/projects/:projectId")
export class HealController {
  public constructor(private readonly healService: HealService) {}

  @Post("issues/:issueId/heal")
  @ApiOperation({ summary: "触发 AI 自愈诊断" })
  async triggerHeal(
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body(new ZodValidationPipe(TriggerHealSchema)) dto: TriggerHealDto,
    @Request() req: { user: { userId: string } },
  ) {
    const job = await this.healService.createJob(projectId, issueId, req.user.userId, dto);
    return { data: job };
  }

  @Get("heal")
  @ApiOperation({ summary: "查询 Heal 任务列表" })
  async listJobs(
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(HealJobQuerySchema)) query: { page: number; limit: number; status?: string },
  ) {
    return await this.healService.listJobs(projectId, query as Parameters<typeof this.healService.listJobs>[1]);
  }

  @Get("heal/:healJobId")
  @ApiOperation({ summary: "查询 Heal 任务详情" })
  async getJob(
    @Param("projectId") projectId: string,
    @Param("healJobId") healJobId: string,
  ) {
    const job = await this.healService.getJob(projectId, healJobId);
    return { data: job };
  }

  @Post("heal/:healJobId/approve")
  @ApiOperation({ summary: "确认执行修复（awaiting_approval → patching）" })
  async approveJob(
    @Param("projectId") projectId: string,
    @Param("healJobId") healJobId: string,
  ) {
    const job = await this.healService.approveJob(projectId, healJobId);
    return { data: job };
  }

  @Post("heal/:healJobId/cancel")
  @ApiOperation({ summary: "取消 Heal 任务" })
  async cancelJob(
    @Param("projectId") projectId: string,
    @Param("healJobId") healJobId: string,
  ) {
    const job = await this.healService.cancelJob(projectId, healJobId);
    return { data: job };
  }

  @Delete("heal/:healJobId")
  @ApiOperation({ summary: "删除 Heal 任务记录" })
  async deleteJob(
    @Param("projectId") projectId: string,
    @Param("healJobId") healJobId: string,
  ) {
    await this.healService.deleteJob(projectId, healJobId);
    return { data: { success: true } };
  }
}
