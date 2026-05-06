import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard, type JwtAuthedRequest } from "./jwt-auth.guard.js";
import { ProjectGuard } from "./project.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { Roles } from "./roles.decorator.js";
import { MembersService } from "./members.service.js";
import {
  InviteMemberSchema,
  type InviteMemberInput,
} from "./dto/invite-member.dto.js";
import {
  UpdateMemberSchema,
  type UpdateMemberInput,
} from "./dto/update-member.dto.js";

@ApiTags("members")
@Controller("api/v1/projects/:projectId/members")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class MembersController {
  public constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: "列出项目成员" })
  public async list(@Param("projectId") projectId: string) {
    const items = await this.members.list(projectId);
    return { data: items };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "邀请成员（admin+）" })
  public async invite(
    @Param("projectId") projectId: string,
    @Req() req: JwtAuthedRequest,
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberInput,
  ) {
    const member = await this.members.invite(
      projectId,
      req.user!.userId,
      body.email,
      body.role,
    );
    return { data: member };
  }

  @Patch(":userId")
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "更新成员角色（admin+）" })
  public async updateRole(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) body: UpdateMemberInput,
  ) {
    await this.members.updateRole(projectId, userId, body.role);
    return { data: { success: true } };
  }

  @Delete(":userId")
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "移除成员（admin+）" })
  public async remove(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
  ) {
    await this.members.remove(projectId, userId);
  }
}
