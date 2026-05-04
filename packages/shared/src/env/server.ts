import { z } from "zod";
import { BaseEnvSchema } from "./base.js";

// 持续时间字符串（如 "1h" / "7d" / "900s"），由 JWT 库自行解析，这里仅保证非空格式
const durationString = z
  .string()
  .regex(/^\d+(ms|s|m|h|d|w|y)$/i, "必须是形如 1h / 7d / 900s 的持续时间");

// 采样率 0..1
const sampleRate = z.coerce.number().min(0).max(1);

/**
 * server 应用专属环境变量
 *
 * 扩展自 BaseEnvSchema，附加：鉴权、限流与采样、SMTP、IP 地域库、通知渠道默认值
 */
export const ServerEnvSchema = BaseEnvSchema.extend({
  // -------- 鉴权 --------
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET 至少 32 字符以满足 HS256 最低安全强度"),
  JWT_EXPIRES_IN: durationString.default("1h"),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_EXPIRES_IN: durationString.default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),

  // -------- 限流与采样 --------
  GATEWAY_RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().default(100),
  GATEWAY_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(200),
  SERVER_DEFAULT_SAMPLE_RATE: sampleRate.default(1),

  // -------- Issue HLL 回写 cron（T1.4.3）--------
  // 0 表示禁用（测试 / 无 Redis 环境）；默认 60s 扫描一次，仅更新 last_seen 最近 30min 的活跃 Issue
  ISSUE_HLL_BACKFILL_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  ISSUE_HLL_BACKFILL_BATCH: z.coerce.number().int().positive().default(500),

  // -------- 邮件（告警通知）--------
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.email(),
  SMTP_SECURE: z
    .preprocess((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v !== "string") return v;
      const lower = v.trim().toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      return v;
    }, z.boolean())
    .default(false),

  // -------- IP 地域库 --------
  GEOIP_DB_PATH: z.string().min(1),

  // -------- Error Processor（TM.E / ADR-0026）--------
  // sync   : Gateway 沿用同步落库（T1.4.1 切片形态，提供 30s 回滚路径）
  // queue  : Gateway 仅 enqueue events-error，ErrorProcessor 异步消费
  // dual   : 双写（enqueue + 同步落库），灰度或指纹重算校验时启用
  ERROR_PROCESSOR_MODE: z.enum(["sync", "queue", "dual"]).default("queue"),
  // ErrorProcessor 并发度 / 重试次数 / 退避首 delay（bullmq 指数退避基准）
  ERROR_PROCESSOR_CONCURRENCY: z.coerce.number().int().positive().default(4),
  ERROR_PROCESSOR_ATTEMPTS: z.coerce.number().int().positive().default(3),
  ERROR_PROCESSOR_BACKOFF_MS: z.coerce.number().int().positive().default(2000),

  // -------- 分区维护 cron（TM.E.5）--------
  // 标准 cron 表达式；默认每周一 03:00 预创建未来分区
  PARTITION_MAINTENANCE_CRON: z.string().min(1).default("0 3 * * 1"),

  // -------- Realtime SSE 大盘（TM.2.C / ADR-0030）--------
  // 采样率：Gateway 入库后按此概率 publish 到 Redis；0 关闭 realtime，1 全量
  REALTIME_SAMPLE_RATE: sampleRate.default(1),
  // Redis Streams 最大长度（每 project × topic）；MAXLEN 约束内存
  REALTIME_STREAM_MAXLEN: z.coerce.number().int().positive().default(1000),
  // 每 projectId 最大并发 SSE 连接（超过直接 429）
  REALTIME_MAX_CONN_PER_PROJECT: z.coerce.number().int().positive().default(10),

  // -------- Sourcemap LRU 缓存（T1.5.3 / ADR-0031）--------
  // SourceMapConsumer 在内存缓存容量（条数），dispose 时调 .destroy() 释放 WASM
  SOURCEMAP_LRU_CAPACITY: z.coerce.number().int().positive().default(100),

  // -------- 通知渠道默认值（可选）--------
  DINGTALK_DEFAULT_WEBHOOK: z.url().optional().or(z.literal("")),
  WECHAT_WORK_DEFAULT_WEBHOOK: z.url().optional().or(z.literal("")),
  SLACK_DEFAULT_WEBHOOK: z.url().optional().or(z.literal("")),
  SMS_PROVIDER: z.enum(["none", "aliyun", "tencent"]).default("none"),
  SMS_ACCESS_KEY: z.string().default(""),
  SMS_ACCESS_SECRET: z.string().default(""),
  SMS_SIGN_NAME: z.string().default(""),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
