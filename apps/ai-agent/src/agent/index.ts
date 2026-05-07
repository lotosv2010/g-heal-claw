/**
 * Agent 模块公开 API。
 *
 * 封装 deepagents createDeepAgent 的创建与配置，
 * 对外提供工厂函数和 Prompt 构建器。
 */
export { createHealAgent, runHealAgent, type AgentResult, type CreateHealAgentParams } from "./agent.service.js";
export {
  buildSystemPrompt,
  buildIssueContext,
  buildRepoConfigContext,
} from "./prompt.js";
