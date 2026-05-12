import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";
import { isPathAllowed } from "../config/repo-config.js";
import { getRepoDir } from "../git/clone.js";

const MAX_LINES = 500;

/**
 * readFile — 从仓库读取源码文件
 *
 * 查找顺序：优先克隆目录，不存在则回退项目根目录
 */
export function createReadFileTool(payload: HealJobPayload, env: AiAgentEnv) {
  return tool(
    async ({ filePath }) => {
      const cloneDir = getRepoDir(payload.healJobId);
      const repoDir = existsSync(join(cloneDir, ".git")) ? cloneDir : process.cwd();
      console.log(`[readFile] 读取根目录: ${repoDir}${repoDir === cloneDir ? "（克隆仓库）" : "（回退本地项目目录）"}`);

      const normalizedPath = filePath.replace(/^\.\//, "");
      const resolvedPath = payload.basePath
        ? (normalizedPath.startsWith(payload.basePath) ? normalizedPath : join(payload.basePath, normalizedPath))
        : normalizedPath;
      const absPath = resolve(join(repoDir, resolvedPath));

      console.log(`[readFile] 目标文件: ${absPath}`);

      if (!absPath.startsWith(resolve(repoDir))) {
        return "ERROR: Path traversal detected — access denied";
      }

      if (payload.repoConfig && !isPathAllowed(filePath, payload.repoConfig)) {
        return `ERROR: Path "${filePath}" is not in allowed paths or is forbidden`;
      }

      try {
        const content = await readFile(absPath, "utf-8");
        const lines = content.split("\n");
        if (lines.length > MAX_LINES) {
          return lines.slice(0, MAX_LINES).join("\n") + `\n... (truncated at ${MAX_LINES} lines, total ${lines.length})`;
        }
        return content;
      } catch {
        return `ERROR: File not found or unreadable: ${resolvedPath}`;
      }
    },
    {
      name: "readFile",
      description: "读取仓库中的源码文件内容（限 500 行，受路径白名单约束）",
      schema: z.object({
        filePath: z.string().describe("相对于仓库根目录的文件路径"),
      }),
    },
  );
}
