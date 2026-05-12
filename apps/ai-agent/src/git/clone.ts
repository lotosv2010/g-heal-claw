import { join } from "node:path";
import { rm, mkdir } from "node:fs/promises";
import { simpleGit } from "simple-git";
import type { HealJobPayload } from "@g-heal-claw/shared";

/**
 * 克隆目标仓库到本地临时目录
 *
 * 路径：<项目运行目录>/tmp/ghc-heal/<healJobId>/
 * 已存在则先清除再重新克隆，确保干净状态。
 */
export async function cloneRepo(payload: HealJobPayload, githubToken?: string): Promise<string> {
  const repoDir = getRepoDir(payload.healJobId);

  // 清理旧目录
  await rm(repoDir, { recursive: true, force: true });
  await mkdir(repoDir, { recursive: true });

  // 构建带认证的 URL
  const cloneUrl = injectToken(payload.repoUrl, githubToken);

  const git = simpleGit();
  await git.clone(cloneUrl, repoDir, [
    "--branch", payload.branch,
    "--depth", "1",
    "--single-branch",
  ]);

  console.log(`[ai-agent] cloned ${payload.repoUrl}@${payload.branch} → ${repoDir}`);
  return repoDir;
}

/** 清理克隆目录 */
export async function cleanupRepo(healJobId: string): Promise<void> {
  const repoDir = getRepoDir(healJobId);
  await rm(repoDir, { recursive: true, force: true });
}

export function getRepoDir(healJobId: string): string {
  return join(process.cwd(), "tmp", "ghc-heal", healJobId);
}

function injectToken(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  // 统一格式：https://<token>@github.com/owner/repo
  // GitHub HTTPS 认证支持直接用 token 作为用户名（密码留空或任意）
  return repoUrl.replace("https://github.com/", `https://${token}@github.com/`);
}
