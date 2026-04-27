import { z } from "zod";
import { BaseEnvSchema } from "./base.js";

/**
 * ai-agent 应用专属环境变量
 *
 * 扩展自 BaseEnvSchema，附加：AI 模型凭证、Git 平台集成、Docker 沙箱配置
 */
export const AiAgentEnvSchema = BaseEnvSchema.extend({
  // -------- AI 模型 --------
  // 至少一家模型凭证必须存在；运行时校验在 parseEnv 后用 superRefine 补充
  ANTHROPIC_API_KEY: z.string().optional().or(z.literal("")),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-7"),
  OPENAI_API_KEY: z.string().optional().or(z.literal("")),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  AI_MAX_STEPS: z.coerce.number().int().positive().default(20),
  AI_MAX_PATCH_LOC: z.coerce.number().int().positive().default(100),

  // -------- Git 平台集成（自愈 PR）--------
  GITHUB_APP_ID: z.string().optional().or(z.literal("")),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().optional().or(z.literal("")),
  GITHUB_WEBHOOK_SECRET: z.string().optional().or(z.literal("")),
  GITLAB_PERSONAL_ACCESS_TOKEN: z.string().optional().or(z.literal("")),
  GITLAB_HOST: z.string().url().default("https://gitlab.com"),

  // -------- 沙箱 --------
  HEAL_SANDBOX_IMAGE: z.string().min(1).default("node:20-alpine"),
  HEAL_SANDBOX_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(600_000),
  HEAL_SANDBOX_MEMORY_MB: z.coerce.number().int().positive().default(2048),
}).superRefine((env, ctx) => {
  // 至少一家 AI 模型凭证必须有效，否则 Agent 无法工作
  const hasAnthropic = env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY !== "";
  const hasOpenAi = env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "";
  if (!hasAnthropic && !hasOpenAi) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ANTHROPIC_API_KEY"],
      message: "ANTHROPIC_API_KEY 与 OPENAI_API_KEY 至少需要提供一个",
    });
  }
});

export type AiAgentEnv = z.infer<typeof AiAgentEnvSchema>;
