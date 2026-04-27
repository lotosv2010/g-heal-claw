import { z } from "zod";

// 布尔字符串：允许 "true" / "false" / "1" / "0"，大小写不敏感；便于 .default(true/false)
const boolString = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return v;
  const lower = v.trim().toLowerCase();
  if (lower === "true" || lower === "1") return true;
  if (lower === "false" || lower === "0") return false;
  return v;
}, z.boolean());

// 端口号：字符串数字，范围 1~65535
const portString = z.coerce.number().int().min(1).max(65535);

/**
 * 基础环境变量 Schema
 *
 * 覆盖：基础设施（PG / Redis / MinIO）、应用运行时、可观测
 * 由所有 app（server / web / ai-agent）共享。
 */
export const BaseEnvSchema = z.object({
  // -------- 基础设施：PostgreSQL --------
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  DATABASE_URL: z.string().url(),

  // -------- 基础设施：Redis --------
  REDIS_URL: z.string().url(),

  // -------- 基础设施：MinIO / S3 对象存储 --------
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_REGION: z.string().min(1).default("us-east-1"),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET_SOURCEMAPS: z.string().min(1),
  MINIO_BUCKET_EVENTS: z.string().min(1),
  MINIO_BUCKET_HEAL: z.string().min(1),

  // -------- 应用运行时 --------
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SERVER_PORT: portString.default(3001),
  WEB_PORT: portString.default(3000),
  AI_AGENT_PORT: portString.default(3002),
  PUBLIC_API_BASE_URL: z.string().url(),
  PUBLIC_WEB_BASE_URL: z.string().url(),

  // -------- 可观测 --------
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal("")),
  OTEL_SERVICE_NAME: z.string().min(1).default("g-heal-claw"),
  PROMETHEUS_ENABLED: boolString.default(true),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

// 供 server / ai-agent 组合时复用的原子：将 optional("") 与 url 统一为 optional<string>
export { boolString, portString };
