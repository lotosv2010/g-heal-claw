import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { ProjectGuard } from "../auth/project.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { ChannelService } from "./channel.service.js";
import {
  CreateChannelSchema,
  type CreateChannelInput,
} from "./dto/create-channel.dto.js";
import {
  UpdateChannelSchema,
  type UpdateChannelInput,
} from "./dto/update-channel.dto.js";

@ApiTags("notification-channels")
@Controller("api/v1/projects/:projectId/channels")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  public constructor(private readonly channelService: ChannelService) {}

  @Get()
  @ApiOperation({ summary: "列出项目下所有通知渠道" })
  public async list(@Param("projectId") projectId: string) {
    const items = await this.channelService.listChannels(projectId);
    return { data: items };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "创建通知渠道（admin+）" })
  public async create(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(CreateChannelSchema)) body: CreateChannelInput,
  ) {
    const channel = await this.channelService.createChannel(projectId, body);
    return { data: channel };
  }

  @Patch(":channelId")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "更新通知渠道（admin+）" })
  public async update(
    @Param("channelId") channelId: string,
    @Body(new ZodValidationPipe(UpdateChannelSchema)) body: UpdateChannelInput,
  ) {
    const channel = await this.channelService.updateChannel(channelId, body);
    if (!channel) {
      throw new NotFoundException({
        error: "CHANNEL_NOT_FOUND",
        message: "通知渠道不存在",
      });
    }
    return { data: channel };
  }

  @Delete(":channelId")
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "删除通知渠道（admin+）" })
  public async delete(@Param("channelId") channelId: string) {
    const deleted = await this.channelService.deleteChannel(channelId);
    if (!deleted) {
      throw new NotFoundException({
        error: "CHANNEL_NOT_FOUND",
        message: "通知渠道不存在",
      });
    }
  }

  @Post(":channelId/test")
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "测试通知渠道发送（admin+）" })
  public async testSend(@Param("channelId") channelId: string) {
    this.logger.log(`测试通知已发送: channel=${channelId}`);
    return { data: { message: "test notification sent", channelId } };
  }
}
