import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { AuthService } from "./auth.service.js";
import { RegisterSchema, type RegisterInput } from "./dto/register.dto.js";
import { LoginSchema, type LoginInput } from "./dto/login.dto.js";
import { RefreshSchema, type RefreshInput } from "./dto/refresh.dto.js";
import { JwtAuthGuard, type JwtAuthedRequest } from "./jwt-auth.guard.js";

@ApiTags("auth")
@Controller("api/v1/auth")
export class AuthController {
  public constructor(private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  @ApiOperation({ summary: "注册新用户" })
  public async register(@Body() body: RegisterInput) {
    const { tokens, user } = await this.auth.register(
      body.email,
      body.password,
      body.displayName,
    );
    return { data: { ...tokens, user } };
  }

  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  @ApiOperation({ summary: "邮箱密码登录" })
  public async login(@Body() body: LoginInput) {
    const { tokens, user } = await this.auth.login(body.email, body.password);
    return { data: { ...tokens, user } };
  }

  @Post("refresh")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(RefreshSchema))
  @ApiOperation({ summary: "刷新 access token" })
  public async refresh(@Body() body: RefreshInput) {
    const tokens = await this.auth.refresh(body.refreshToken);
    return { data: tokens };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "登出（销毁 refresh token）" })
  public async logout(@Req() req: FastifyRequest) {
    const body = req.body as { refreshToken?: string } | undefined;
    if (body?.refreshToken) {
      await this.auth.logout(body.refreshToken);
    }
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取当前用户信息" })
  public async me(@Req() req: JwtAuthedRequest) {
    const user = await this.auth.getMe(req.user!.userId);
    if (!user) {
      return { data: { user: null } };
    }
    return { data: { user } };
  }
}
