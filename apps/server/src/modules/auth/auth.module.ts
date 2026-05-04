import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { ProjectGuard } from "./project.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsController } from "./projects.controller.js";
import { MembersService } from "./members.service.js";
import { MembersController } from "./members.controller.js";
import { TokensService } from "./tokens.service.js";
import { TokensController } from "./tokens.controller.js";

/**
 * AuthModule（ADR-0032）
 *
 * 认证与项目管理 MVP 完整模块：
 * - AuthService / ProjectsService / MembersService / TokensService
 * - AuthController / ProjectsController / MembersController / TokensController
 * - JwtAuthGuard / ProjectGuard / RolesGuard：三层认证链
 */
@Module({
  controllers: [
    AuthController,
    ProjectsController,
    MembersController,
    TokensController,
  ],
  providers: [
    AuthService,
    ProjectsService,
    MembersService,
    TokensService,
    JwtAuthGuard,
    ProjectGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    ProjectsService,
    MembersService,
    TokensService,
    JwtAuthGuard,
    ProjectGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
