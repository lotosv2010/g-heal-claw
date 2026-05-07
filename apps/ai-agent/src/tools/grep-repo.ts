import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";

const execFileAsync = promisify(execFile);
const MAX_RESULTS = 50;

/**
 * grepRepo — 在仓库内搜索模式（使用 grep -rn）
 */
export function createGrepRepoTool(payload: HealJobPayload, _env: AiAgentEnv) {
  return tool(
    async ({ pattern, glob }) => {
      const repoDir = getRepoDir(payload.healJobId);

      try {
        const args = ["-rn", "--include", glob ?? "*.ts", "-m", String(MAX_RESULTS), pattern, "."];
        const { stdout } = await execFileAsync("grep", args, {
          cwd: repoDir,
          timeout: 15_000,
          maxBuffer: 1024 * 1024,
        });

        const lines = stdout.split("\n").filter(Boolean);
        if (lines.length === 0) return "No matches found";
        return lines.slice(0, MAX_RESULTS).join("\n");
      } catch (err: unknown) {
        // grep 退出码 1 = 无匹配（非错误）
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 1) {
          return "No matches found";
        }
        return `ERROR: grep failed — ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "grepRepo",
      description: "在仓库内搜索匹配模式的代码行（限 50 条结果）",
      schema: z.object({
        pattern: z.string().describe("搜索的正则/字面量模式"),
        glob: z.string().optional().describe("文件 glob 过滤（默认 *.ts）"),
      }),
    },
  );
}

function getRepoDir(healJobId: string): string {
  return join(process.env.TMPDIR ?? "/tmp", "ghc-heal", healJobId);
}
