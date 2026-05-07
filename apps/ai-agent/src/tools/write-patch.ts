import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";
import { isPathAllowed } from "../config/repo-config.js";

/**
 * writePatch — 将修改写入文件并记录 diff
 *
 * 校验 AI_MAX_PATCH_LOC 限制和路径白名单。
 */
export function createWritePatchTool(payload: HealJobPayload, env: AiAgentEnv) {
  return tool(
    async ({ filePath, newContent }) => {
      const repoDir = getRepoDir(payload.healJobId);
      const absPath = resolve(join(repoDir, filePath));

      if (!absPath.startsWith(resolve(repoDir))) {
        return "ERROR: Path traversal detected";
      }

      if (!isPathAllowed(filePath, payload.repoConfig)) {
        return `ERROR: Path "${filePath}" is forbidden by repo config`;
      }

      // 计算变更行数
      let oldContent = "";
      try {
        oldContent = await readFile(absPath, "utf-8");
      } catch {
        // 新建文件
      }

      const oldLines = oldContent.split("\n").length;
      const newLines = newContent.split("\n").length;
      const diffLoc = Math.abs(newLines - oldLines) + countChangedLines(oldContent, newContent);

      if (diffLoc > env.AI_MAX_PATCH_LOC) {
        return `ERROR: Patch exceeds LOC limit (${diffLoc} > ${env.AI_MAX_PATCH_LOC}). Reduce scope.`;
      }

      await writeFile(absPath, newContent, "utf-8");
      return `SUCCESS: Written ${newLines} lines to ${filePath} (estimated ${diffLoc} LOC changed)`;
    },
    {
      name: "writePatch",
      description: "将修复后的文件内容写入仓库（校验 LOC 限制和路径白名单）",
      schema: z.object({
        filePath: z.string().describe("相对于仓库根目录的文件路径"),
        newContent: z.string().describe("修改后的完整文件内容"),
      }),
    },
  );
}

function countChangedLines(oldContent: string, newContent: string): number {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  let changed = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (oldLines[i] !== newLines[i]) changed++;
  }
  return changed;
}

function getRepoDir(healJobId: string): string {
  return join(process.env.TMPDIR ?? "/tmp", "ghc-heal", healJobId);
}
