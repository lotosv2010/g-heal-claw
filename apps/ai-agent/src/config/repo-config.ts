import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const RepoHealConfigSchema = z.object({
  maxLoc: z.number().int().positive().default(50),
  paths: z.array(z.string()).default(["src/**"]),
  forbidden: z.array(z.string()).default([]),
  verify: z.array(z.string()).default([]),
  allowNetwork: z.boolean().default(false),
});

export type RepoHealConfig = z.infer<typeof RepoHealConfigSchema>;

/**
 * 从仓库根目录读取 `.ghealclaw.yml` 配置
 */
export async function loadRepoConfig(repoDir: string): Promise<RepoHealConfig> {
  const configPath = join(repoDir, ".ghealclaw.yml");
  try {
    const raw = await readFile(configPath, "utf-8");
    const parsed = parseYaml(raw);
    const config = RepoHealConfigSchema.parse(parsed?.heal ?? {});
    return config;
  } catch {
    // 配置文件不存在或格式错误，使用默认值
    return RepoHealConfigSchema.parse({});
  }
}

/**
 * 检查文件路径是否被允许操作
 */
export function isPathAllowed(
  filePath: string,
  repoConfig?: { paths?: string[]; forbidden?: string[] },
): boolean {
  if (!repoConfig) return true;

  const { paths = ["src/**"], forbidden = [] } = repoConfig;

  // 检查 forbidden（黑名单优先）
  for (const pattern of forbidden) {
    if (matchGlob(filePath, pattern)) return false;
  }

  // 检查 paths（白名单）
  for (const pattern of paths) {
    if (matchGlob(filePath, pattern)) return true;
  }

  return false;
}

/**
 * 简单 glob 匹配（支持 ** 和 *）
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regexStr}$`).test(filePath);
}
