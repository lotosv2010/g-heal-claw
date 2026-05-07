import { z } from "zod";
import { BaseEnvSchema } from "./base.js";

/**
 * ai-agent 应用专属环境变量
 *
 * 扩展自 BaseEnvSchema，附加：LLM Provider 选择 + 各模型凭证 + Git 平台 + 沙箱
 */
export const AiAgentEnvSchema = BaseEnvSchema.extend({
  // -------- LLM Provider 选择 --------
  LLM_PROVIDER: z.enum([
    "deepseek", "deepseek-reasoner", "gemini", "moonshot", "minimax", "ollama",
  ]).default("deepseek"),

  // -------- Deepseek --------
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_API_KEY: z.string().optional().or(z.literal("")),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  DEEPSEEK_REASONER_MODEL: z.string().default("deepseek-reasoner"),

  // -------- Gemini --------
  GEMINI_API_KEY: z.string().optional().or(z.literal("")),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // -------- Moonshot (Kimi) --------
  MOONSHOT_BASE_URL: z.string().url().default("https://api.moonshot.cn/v1"),
  MOONSHOT_API_KEY: z.string().optional().or(z.literal("")),
  MOONSHOT_MODEL: z.string().default("moonshot-v1-128k"),

  // -------- MiniMax --------
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/anthropic"),
  MINIMAX_API_KEY: z.string().optional().or(z.literal("")),
  MINIMAX_MODEL: z.string().default("MiniMax-M1"),

  // -------- Ollama (本地) --------
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b"),

  // -------- 护栏 --------
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
});

export type AiAgentEnv = z.infer<typeof AiAgentEnvSchema>;
