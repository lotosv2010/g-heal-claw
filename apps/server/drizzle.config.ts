import "dotenv-flow/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 配置（ADR-0017 §2）
//
// 读取 monorepo 根的 .env* 链；本地迁移默认走 DATABASE_URL。
// 生产路径：CI 执行 `pnpm -F @g-heal-claw/server db:migrate` 跑 drizzle/*.sql。
export default defineConfig({
  // glob 绕过桶式 schema.ts 的 `.js` CJS 解析问题
  schema: "./src/shared/database/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres",
  },
  // 按业务域前缀分组，迁移文件里表名可读
  casing: "snake_case",
  // Drizzle Kit 生成的 SQL 带表注释，便于 DBA Review
  verbose: true,
  strict: true,
});
