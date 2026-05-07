/**
 * System Prompt 构建（ADR-0036 · DESIGN §8.1）
 *
 * 定义 Agent 角色、行为准则、诊断流程和修复约束。
 * 不硬编码 Tool 名，Agent 根据目标自行选择。
 */

const BASE_PROMPT = `你是资深前端工程师，任务是诊断生产环境异常并生成修复代码。

## 行为准则

1. 所有推理必须基于提供的代码上下文，不得臆造不存在的代码
2. 修复应最小化变更，仅修改必要的代码
3. 每次 writePatch 的变更不超过 LOC 限制
4. 不得修改路径白名单之外的文件
5. 修复优先保证类型安全，避免引入新的 any / @ts-ignore
6. 如果无法确定根因或修复方案，诚实说明原因并终止
7. 使用中文回复诊断摘要

## 诊断流程

1. 使用 readIssue 获取异常上下文（标题、堆栈、面包屑、近期事件）
2. 分析堆栈定位问题源码文件
3. 使用 readFile 阅读相关源码
4. 使用 grepRepo 搜索调用点或相关模式
5. 确定根因后，使用 writePatch 生成修复
6. 使用 createPr 创建修复 PR

## 输出格式

在最终 createPr 之前，先总结：
- rootCause：根因描述
- evidence：关键证据（代码行号、变量状态）
- confidence：high / medium / low

## 风险声明

所有修复均为 AI 自动生成，需人工 Review 后合并。`;

/** buildSystemPrompt 参数 */
interface BuildSystemPromptParams {
  /** Issue 上下文（标题 + 错误信息 + 堆栈） */
  readonly issueContext?: string;
  /** 仓库配置摘要（路径白名单 / LOC 限制） */
  readonly repoConfigContext?: string;
}

/**
 * 构建 System Prompt。
 *
 * 包含角色定义 + Issue 上下文 + 仓库约束。
 */
export function buildSystemPrompt(params?: BuildSystemPromptParams): string {
  const parts = [BASE_PROMPT];

  if (params?.repoConfigContext) {
    parts.push(`## 仓库约束\n\n${params.repoConfigContext}`);
  }

  if (params?.issueContext) {
    parts.push(`## 待诊断 Issue\n\n${params.issueContext}`);
  }

  return parts.join("\n\n");
}

/**
 * 构建 Issue 上下文文本
 */
export function buildIssueContext(payload: {
  issueId: string;
  issueTitle: string;
  issueMessage: string;
  stackTrace?: string;
  breadcrumbs?: string;
}): string {
  const lines = [
    `- Issue ID: ${payload.issueId}`,
    `- 标题: ${payload.issueTitle}`,
    `- 错误信息: ${payload.issueMessage}`,
  ];
  if (payload.stackTrace) {
    lines.push(`- 堆栈:\n\`\`\`\n${payload.stackTrace}\n\`\`\``);
  }
  if (payload.breadcrumbs) {
    lines.push(`- 面包屑: ${payload.breadcrumbs}`);
  }
  return lines.join("\n");
}

/**
 * 构建仓库配置上下文
 */
export function buildRepoConfigContext(config?: {
  maxLoc?: number;
  paths?: string[];
  forbidden?: string[];
}): string {
  if (!config) return "- 无特殊约束，默认允许 src/** 下所有文件";
  const lines = [
    `- 最大变更行数: ${config.maxLoc ?? 50}`,
    `- 允许路径: ${(config.paths ?? ["src/**"]).join(", ")}`,
  ];
  if (config.forbidden?.length) {
    lines.push(`- 禁止路径: ${config.forbidden.join(", ")}`);
  }
  return lines.join("\n");
}
