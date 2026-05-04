import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ROLES_KEY,
  ROLE_LEVEL,
  type ProjectRole,
} from "./roles.decorator.js";
import type { ProjectAuthedRequest } from "./project.guard.js";

/**
 * RolesGuard（ADR-0032 §3.3）
 *
 * 前置依赖：ProjectGuard 已注入 req.projectMember
 * 流程：
 *  1. 读取 @Roles() 元数据（允许的角色列表）
 *  2. 无 @Roles() 装饰 → 放行（仅需项目成员身份即可）
 *  3. 比较用户角色等级与最低要求
 */
@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      ProjectRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // 未声明 @Roles() → 仅需项目成员身份
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<ProjectAuthedRequest>();
    const memberCtx = req.projectMember;
    if (!memberCtx) {
      throw new ForbiddenException({
        error: "PROJECT_GUARD_REQUIRED",
        message: "需要先通过 ProjectGuard 认证",
      });
    }

    const userLevel = ROLE_LEVEL[memberCtx.role] ?? -1;
    const hasPermission = requiredRoles.some(
      (role) => userLevel >= ROLE_LEVEL[role],
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        error: "INSUFFICIENT_ROLE",
        message: `需要角色 ${requiredRoles.join(" 或 ")}，当前为 ${memberCtx.role}`,
      });
    }

    return true;
  }
}
