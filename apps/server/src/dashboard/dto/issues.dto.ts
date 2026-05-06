import { z } from "zod";

/** Issues 列表查询参数 */
export const IssuesListQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
  status: z.enum(["open", "resolved", "ignored"]).optional(),
  subType: z.string().optional(),
  environment: z.string().optional(),
  sort: z.enum(["last_seen", "first_seen", "event_count"]).default("last_seen"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type IssuesListQuery = z.infer<typeof IssuesListQuerySchema>;

/** Issue 详情查询 */
export const IssueDetailQuerySchema = z.object({
  projectId: z.string().min(1, "projectId 必填"),
});
export type IssueDetailQuery = z.infer<typeof IssueDetailQuerySchema>;

/** 状态变更 */
export const IssueStatusUpdateSchema = z.object({
  status: z.enum(["open", "resolved", "ignored"]),
});
export type IssueStatusUpdate = z.infer<typeof IssueStatusUpdateSchema>;

/** Issues 列表行 DTO */
export interface IssueListItemDto {
  readonly id: string;
  readonly fingerprint: string;
  readonly subType: string;
  readonly title: string;
  readonly level: string;
  readonly status: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly eventCount: number;
  readonly impactedSessions: number;
  readonly assignedUserId: string | null;
}

/** Issue 详情 DTO（含代表事件信息） */
export interface IssueDetailDto extends IssueListItemDto {
  readonly recentEvents: readonly IssueEventDto[];
}

/** Issue 关联的近期事件样本 */
export interface IssueEventDto {
  readonly eventId: string;
  readonly timestamp: string;
  readonly message: string;
  readonly stack: string | null;
  readonly url: string | null;
  readonly browser: string | null;
  readonly os: string | null;
  readonly deviceType: string | null;
  readonly environment: string | null;
  readonly sessionId: string;
}
