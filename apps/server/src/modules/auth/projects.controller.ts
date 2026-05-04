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
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard, type JwtAuthedRequest } from "./jwt-auth.guard.js";
import { ProjectGuard } from "./project.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { Roles } from "./roles.decorator.js";
import { ProjectsService } from "./projects.service.js";
import {
  CreateProjectSchema,
  type CreateProjectInput,
} from "./dto/create-project.dto.js";
import {
  UpdateProjectSchema,
  type UpdateProjectInput,
} from "./dto/update-project.dto.js";

@ApiTags("projects")
@Controller("api/v1/projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  public constructor(private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(CreateProjectSchema))
  @ApiOperation({ summary: "创建项目（自动成为 owner）" })
  public async create(
    @Req() req: JwtAuthedRequest,
    @Body() body: CreateProjectInput,
  ) {
    const result = await this.projects.create(req.user!.userId, body);
    return { data: result };
  }

  @Get()
  @ApiOperation({ summary: "列出当前用户的所有项目" })
  public async list(@Req() req: JwtAuthedRequest) {
    const items = await this.projects.list(req.user!.userId);
    return { data: items };
  }

  @Get(":projectId")
  @UseGuards(ProjectGuard)
  @ApiOperation({ summary: "获取项目详情" })
  public async getById(@Param("projectId") projectId: string) {
    const project = await this.projects.getById(projectId);
    if (!project) {
      throw new NotFoundException({
        error: "PROJECT_NOT_FOUND",
        message: "项目不存在",
      });
    }
    return { data: project };
  }

  @Patch(":projectId")
  @UseGuards(ProjectGuard, RolesGuard)
  @Roles("admin")
  @UsePipes(new ZodValidationPipe(UpdateProjectSchema))
  @ApiOperation({ summary: "更新项目配置（admin+）" })
  public async update(
    @Param("projectId") projectId: string,
    @Body() body: UpdateProjectInput,
  ) {
    const project = await this.projects.update(projectId, body);
    if (!project) {
      throw new NotFoundException({
        error: "PROJECT_NOT_FOUND",
        message: "项目不存在",
      });
    }
    return { data: project };
  }

  @Delete(":projectId")
  @HttpCode(204)
  @UseGuards(ProjectGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "软删除项目（仅 owner）" })
  public async remove(@Param("projectId") projectId: string) {
    const deleted = await this.projects.softDelete(projectId);
    if (!deleted) {
      throw new NotFoundException({
        error: "PROJECT_NOT_FOUND",
        message: "项目不存在",
      });
    }
  }
}
