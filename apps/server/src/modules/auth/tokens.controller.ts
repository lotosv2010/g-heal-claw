import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { ProjectGuard } from "./project.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { Roles } from "./roles.decorator.js";
import { TokensService } from "./tokens.service.js";
import {
  CreateTokenSchema,
  type CreateTokenInput,
} from "./dto/create-token.dto.js";

@ApiTags("tokens")
@Controller("api/v1/projects/:projectId/tokens")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class TokensController {
  public constructor(private readonly tokens: TokensService) {}

  @Get()
  @ApiOperation({ summary: "列出项目 API Token（secretKey 脱敏）" })
  public async list(@Param("projectId") projectId: string) {
    const items = await this.tokens.list(projectId);
    return { data: items };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @UsePipes(new ZodValidationPipe(CreateTokenSchema))
  @ApiOperation({ summary: "创建 API Token（admin+，返回完整 secretKey）" })
  public async create(
    @Param("projectId") projectId: string,
    @Body() body: CreateTokenInput,
  ) {
    const token = await this.tokens.create(projectId, body.label);
    return { data: token };
  }

  @Delete(":tokenId")
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles("admin")
  @ApiOperation({ summary: "删除 API Token（admin+）" })
  public async remove(
    @Param("projectId") projectId: string,
    @Param("tokenId") tokenId: string,
  ) {
    const deleted = await this.tokens.remove(projectId, tokenId);
    if (!deleted) {
      throw new NotFoundException({
        error: "TOKEN_NOT_FOUND",
        message: "Token 不存在",
      });
    }
  }
}
