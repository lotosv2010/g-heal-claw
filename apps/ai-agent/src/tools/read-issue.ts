import { z } from "zod";
import { tool } from "@langchain/core/tools";
import postgres from "postgres";
import type { AiAgentEnv, HealJobPayload } from "@g-heal-claw/shared";

/**
 * readIssue — 从数据库读取 issue 完整上下文
 */
export function createReadIssueTool(payload: HealJobPayload, env: AiAgentEnv) {
  return tool(
    async ({ issueId }) => {
      const sql = postgres(env.DATABASE_URL, { max: 1 });
      try {
        const [issue] = await sql`
          SELECT id, title, sub_type, level, status, first_seen, last_seen, event_count
          FROM issues WHERE id = ${issueId}
        `;
        if (!issue) return `Issue ${issueId} not found`;

        // 获取最近 5 个事件的堆栈和消息
        const events = await sql`
          SELECT message, stack_trace, breadcrumbs, device, page, created_at
          FROM error_events_raw
          WHERE project_id = ${payload.projectId}
            AND message_head = ${String(issue.title).slice(0, 100)}
          ORDER BY created_at DESC
          LIMIT 5
        `;

        return JSON.stringify({ issue, recentEvents: events }, null, 2);
      } finally {
        await sql.end();
      }
    },
    {
      name: "readIssue",
      description: "读取异常 Issue 的完整上下文（标题、堆栈、面包屑、近期事件样本）",
      schema: z.object({
        issueId: z.string().describe("Issue ID（如 iss_xxx）"),
      }),
    },
  );
}
