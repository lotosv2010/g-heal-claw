import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogle } from "@langchain/google";
import { ChatOllama } from "@langchain/ollama";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { AiAgentEnv } from "@g-heal-claw/shared";

/** 支持的 LLM Provider 标识 */
export type ModelId =
  | "deepseek"
  | "deepseek-reasoner"
  | "gemini"
  | "moonshot"
  | "minimax"
  | "ollama";

/** API 协议类型，决定使用哪个 LangChain 客户端 */
type ApiProtocol = "deepseek" | "openai" | "anthropic" | "google" | "ollama";

interface ModelConfig {
  readonly protocol: ApiProtocol;
  readonly baseURL?: string;
  readonly apiKey?: string;
  readonly modelName: string;
  readonly extraKwargs?: Readonly<Record<string, unknown>>;
}

/**
 * 模型注册表：从已校验的环境变量构建每个 Provider 的配置
 */
function buildModelRegistry(env: AiAgentEnv): Record<ModelId, ModelConfig> {
  return {
    deepseek: {
      protocol: "deepseek",
      baseURL: env.DEEPSEEK_BASE_URL,
      apiKey: env.DEEPSEEK_API_KEY,
      modelName: env.DEEPSEEK_MODEL,
    },
    "deepseek-reasoner": {
      protocol: "deepseek",
      baseURL: env.DEEPSEEK_BASE_URL,
      apiKey: env.DEEPSEEK_API_KEY,
      modelName: env.DEEPSEEK_REASONER_MODEL,
    },
    gemini: {
      protocol: "google",
      apiKey: env.GEMINI_API_KEY,
      modelName: env.GEMINI_MODEL,
    },
    moonshot: {
      protocol: "openai",
      baseURL: env.MOONSHOT_BASE_URL,
      apiKey: env.MOONSHOT_API_KEY,
      modelName: env.MOONSHOT_MODEL,
      extraKwargs: { thinking: { type: "disabled" } },
    },
    minimax: {
      protocol: "anthropic",
      baseURL: env.MINIMAX_BASE_URL,
      apiKey: env.MINIMAX_API_KEY,
      modelName: env.MINIMAX_MODEL,
    },
    ollama: {
      protocol: "ollama",
      baseURL: env.OLLAMA_BASE_URL,
      modelName: env.OLLAMA_MODEL,
    },
  };
}

/**
 * 客户端工厂 —— 每种协议对应一个构建函数
 */
const CLIENT_FACTORY: Record<ApiProtocol, (config: ModelConfig) => BaseLanguageModel> = {
  deepseek: (config) =>
    new ChatDeepSeek({
      apiKey: config.apiKey,
      model: config.modelName,
      configuration: { baseURL: config.baseURL },
    }),

  openai: (config) =>
    new ChatOpenAI({
      model: config.modelName,
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseURL },
      ...(config.extraKwargs ? { modelKwargs: config.extraKwargs } : {}),
    }),

  anthropic: (config) =>
    new ChatAnthropic({
      anthropicApiUrl: config.baseURL,
      anthropicApiKey: config.apiKey,
      modelName: config.modelName,
    }),

  // @langchain/google@0.1.11 类型滞后于 @langchain/core@1.1.44，运行时兼容
  google: (config) =>
    new ChatGoogle({
      apiKey: config.apiKey,
      model: config.modelName,
    }) as unknown as BaseLanguageModel,

  ollama: (config) =>
    new ChatOllama({
      model: config.modelName,
      baseUrl: config.baseURL,
      temperature: 0,
      maxRetries: 2,
    }),
};

/**
 * 根据 LLM_PROVIDER 环境变量创建 LLM 实例（ADR-0036）
 *
 * @param env 已校验的 AiAgentEnv
 * @returns LangChain 兼容的 Chat Model
 */
export function createModel(env: AiAgentEnv): BaseLanguageModel {
  const id = env.LLM_PROVIDER as ModelId;
  const registry = buildModelRegistry(env);
  const config = registry[id];

  // 非本地模型需要 API Key
  if (config.protocol !== "ollama" && !config.apiKey) {
    throw new Error(
      `[ai-agent] Missing API key for provider "${id}". Check environment variables.`,
    );
  }

  const factory = CLIENT_FACTORY[config.protocol];
  console.log(`[ai-agent] Using LLM provider=${id} model=${config.modelName}`);
  return factory(config);
}
