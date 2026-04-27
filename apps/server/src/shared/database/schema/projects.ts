import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * 项目主表（多租户根 —— ADR-0017 §3.2）
 *
 * slug 用于 URL 友好访问；platform 预留扩展（web / miniapp / mobile）。
 * owner 通过 users FK 强绑定，ON DELETE RESTRICT 避免孤儿项目。
 * retention_days 决定事件保留窗口，默认 30 天。
 */
export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // proj_xxx
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull().default("web"),
    ownerUserId: varchar("owner_user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    retentionDays: integer("retention_days").notNull().default(30),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_projects_owner").on(t.ownerUserId)],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

/**
 * DSN 鉴权键（ADR-0017 §3.3）
 *
 * public_key：SDK DSN 公开半，Gateway 鉴权入口（T1.3.2）
 * secret_key：CLI / Sourcemap 私有半，禁止前端暴露
 * is_active：软禁用（轮转场景）；partial index 仅走热集合
 */
export const projectKeys = pgTable(
  "project_keys",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // pk_xxx
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    publicKey: varchar("public_key", { length: 64 }).notNull().unique(),
    secretKey: varchar("secret_key", { length: 64 }).notNull().unique(),
    label: varchar("label", { length: 64 }),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_project_keys_project").on(t.projectId),
    // partial index（is_active = true）在 ddl.ts 手工补充，Drizzle 暂不支持原生表达
  ],
);

export type ProjectKeyRow = typeof projectKeys.$inferSelect;
export type NewProjectKeyRow = typeof projectKeys.$inferInsert;

/**
 * 项目成员（RBAC —— ADR-0017 §3.4）
 *
 * 复合主键 (project_id, user_id)，role 为项目级（区别于 users.role 系统级）。
 * invited_by 追溯邀请关系，删除用户时置 NULL 保留审计链。
 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(), // owner | admin | member | viewer
    invitedBy: varchar("invited_by", { length: 32 }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("idx_members_user").on(t.userId),
  ],
);

export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type NewProjectMemberRow = typeof projectMembers.$inferInsert;

/**
 * 环境表（ADR-0017 §3.5）
 *
 * 复合主键 (project_id, name)；is_production 标记生产环境便于告警分组。
 */
export const environments = pgTable(
  "environments",
  {
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 32 }).notNull(),
    description: text("description"),
    isProduction: boolean("is_production").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.name] })],
);

export type EnvironmentRow = typeof environments.$inferSelect;
export type NewEnvironmentRow = typeof environments.$inferInsert;
