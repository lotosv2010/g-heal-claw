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

  // -------- 限流与采样 --------
  GATEWAY_RATE_LIMIT_PER_SEC: z.coerce.number().int().positive().default(100),
  GATEWAY_RATE_LIMIT_BURST: z.coerce.number().int().positive().default(200),
  SERVER_DEFAULT_SAMPLE_RATE: sampleRate.default(1),

  // -------- 邮件（告警通知）--------
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().email(),
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

  // -------- 通知渠道默认值（可选）--------
  DINGTALK_DEFAULT_WEBHOOK: z.string().url().optional().or(z.literal("")),
  WECHAT_WORK_DEFAULT_WEBHOOK: z.string().url().optional().or(z.literal("")),
  SLACK_DEFAULT_WEBHOOK: z.string().url().optional().or(z.literal("")),
  SMS_PROVIDER: z.enum(["none", "aliyun", "tencent"]).default("none"),
  SMS_ACCESS_KEY: z.string().default(""),
  SMS_ACCESS_SECRET: z.string().default(""),
  SMS_SIGN_NAME: z.string().default(""),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
