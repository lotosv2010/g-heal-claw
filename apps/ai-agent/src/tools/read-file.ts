import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";
import { isPathAllowed } from "../config/repo-config.js";

const MAX_LINES = 500;

/**
 * readFile — 从克隆仓库读取源码文件
 */
export function createReadFileTool(payload: HealJobPayload, env: AiAgentEnv) {
  return tool(
    async ({ filePath }) => {
      const repoDir = getRepoDir(payload.healJobId);
      const absPath = resolve(join(repoDir, filePath));

      // 安全校验：不允许逃逸出仓库目录
      if (!absPath.startsWith(resolve(repoDir))) {
        return "ERROR: Path traversal detected — access denied";
      }

      // 路径白名单校验
      if (!isPathAllowed(filePath, payload.repoConfig)) {
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
        return `ERROR: File not found or unreadable: ${filePath}`;
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

function getRepoDir(healJobId: string): string {
  return join(process.env.TMPDIR ?? "/tmp", "ghc-heal", healJobId);
}
