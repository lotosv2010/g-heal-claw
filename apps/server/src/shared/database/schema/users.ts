import {
  boolean,
  index,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 用户主表（ADR-0017 §3.1）
 *
 * 认证主体，系统级 role 区分 admin / user；项目级权限在 project_members。
 * 密码哈希选型在 T1.1.7 认证落地时决定（argon2id 或 bcrypt）。
 */
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // usr_xxx
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 64 }),
    role: varchar("role", { length: 16 }).notNull().default("user"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_users_email").on(t.email)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
