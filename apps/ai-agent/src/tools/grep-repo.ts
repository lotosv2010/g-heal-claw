import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";
import { getRepoDir } from "../git/clone.js";

const execFileAsync = promisify(execFile);
const MAX_RESULTS = 50;

/**
 * grepRepo — 在仓库内搜索模式
 *
 * 查找顺序：优先克隆目录，不存在则回退项目根目录
 */
export function createGrepRepoTool(payload: HealJobPayload, _env: AiAgentEnv) {
  return tool(
    async ({ pattern, glob, directory }) => {
      const cloneDir = getRepoDir(payload.healJobId);
      const repoDir = existsSync(join(cloneDir, ".git")) ? cloneDir : process.cwd();
      console.log(`[grepRepo] 搜索根目录: ${repoDir}${repoDir === cloneDir ? "（克隆仓库）" : "（回退本地项目目录）"}`);

      let searchDir: string;
      if (payload.basePath) {
        if (!directory) {
          searchDir = payload.basePath;
        } else if (directory.startsWith(payload.basePath)) {
          // AI 已传入完整路径，不重复拼接
          searchDir = directory;
        } else {
          searchDir = join(payload.basePath, directory);
        }
      } else {
        searchDir = directory || ".";
      }
      console.log(`[grepRepo] 子目录: ${searchDir} | pattern: "${pattern}"`);

      try {
        const includes = glob
          ? [`--include=${glob}`]
          : ["--include=*.ts", "--include=*.tsx", "--include=*.vue", "--include=*.js", "--include=*.jsx", "--include=*.svelte"];
        const args = [
          "-rn",
          ...includes,
          "--exclude-dir=node_modules",
          "--exclude-dir=dist",
          "--exclude-dir=.git",
          "-m", String(MAX_RESULTS),
          pattern,
          searchDir,
        ];
        const { stdout } = await execFileAsync("grep", args, {
          cwd: repoDir,
          timeout: 15_000,
          maxBuffer: 1024 * 1024,
        });

        const lines = stdout.split("\n").filter(Boolean);
        if (lines.length === 0) return "No matches found";
        return lines.slice(0, MAX_RESULTS).join("\n");
      } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 1) {
          return "No matches found";
        }
        return `ERROR: grep failed — ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "grepRepo",
      description: "在仓库内搜索匹配模式的代码行（限 50 条，默认搜索 ts/vue/js 等文件，排除 node_modules/dist）",
      schema: z.object({
        pattern: z.string().describe("搜索的正则/字面量模式"),
        glob: z.string().optional().describe("文件 glob 过滤（默认 *.{ts,tsx,vue,js,jsx,svelte}）"),
        directory: z.string().optional().describe("搜索子目录（相对仓库根，如 examples/vue-demo/src）"),
      }),
    },
  );
}
