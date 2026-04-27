import { z } from "zod";
import { SdkEventSchema } from "./union.js";

/**
 * Gateway `/ingest/v1/events` 批量请求体（SPEC §5.1）
 *
 * - dsn 字段与 Authorization 头二选一；校验在 GatewayGuard 里再做一层
 * - 单批事件数约束在 Gateway RateLimit 层（配置项 SERVER_DEFAULT_SAMPLE_RATE 不影响此处）
 */
export const IngestRequestSchema = z.object({
  dsn: z.string().min(1).optional(),
  sentAt: z.number().int().nonnegative(),
  events: z.array(SdkEventSchema).min(1).max(200),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;
