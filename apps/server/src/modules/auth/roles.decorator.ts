import { type CustomDecorator, SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "auth:roles";

export type ProjectRole = "owner" | "admin" | "member" | "viewer";

// 角色等级：数值越高权限越大
export const ROLE_LEVEL: Record<ProjectRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * 声明端点所需的最低项目角色
 * 使用方式：`@Roles("admin")` — 仅 admin / owner 可访问
 */
export function Roles(
  ...roles: readonly ProjectRole[]
): CustomDecorator<string> {
  return SetMetadata(ROLES_KEY, roles);
}
