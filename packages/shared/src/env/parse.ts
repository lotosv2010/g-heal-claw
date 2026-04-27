import { z } from "zod";

/**
 * Env 解析失败的结构化错误
 *
 * 为什么：`z.ZodError.message` 是长 JSON 字符串，启动时打印对人类不友好；
 * 这里把字段级错误整理为每行一条的可读格式，便于运维快速定位缺失变量。
 */
export class EnvValidationError extends Error {
  public readonly issues: readonly z.ZodIssue[];

  public constructor(issues: readonly z.ZodIssue[]) {
    const lines = issues.map((issue) => {
      const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
      return `  · ${path}: ${issue.message}`;
    });
    super(`环境变量校验失败：\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * 纯函数：对给定 raw 对象运行 Zod Schema 校验，失败抛 EnvValidationError
 *
 * 不读取 `process.env`，由调用方决定来源（process.env / @nestjs/config 加载结果 / 测试 fixture）。
 * 这样 SDK 等浏览器环境引用 shared 包时不会触发 Node.js 全局引用。
 */
export function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  raw: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
