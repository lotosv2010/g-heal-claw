import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Query,
  Req,
  Res,
  UsePipes,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { RealtimeService } from "./realtime.service.js";
import {
  REALTIME_TOPICS,
  type RealtimePayload,
  type RealtimeTopic,
} from "./topics.js";

/** Query 校验：topics 为逗号分隔字符串，拆分后白名单过滤 */
export const RealtimeStreamQuerySchema = z
  .object({
    projectId: z.string().min(1),
    topics: z.string().optional(),
    lastEventId: z.string().optional(),
  })
  .transform((input) => ({
    projectId: input.projectId,
    lastEventId: input.lastEventId,
    topics: parseTopics(input.topics),
  }));
export type RealtimeStreamQuery = z.infer<typeof RealtimeStreamQuerySchema>;

function parseTopics(raw: string | undefined): readonly RealtimeTopic[] {
  if (!raw) return REALTIME_TOPICS;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RealtimeTopic =>
      (REALTIME_TOPICS as readonly string[]).includes(s),
    );
  return list.length > 0 ? list : REALTIME_TOPICS;
}

/**
 * SSE 实时大盘端点（ADR-0030 §4 / TM.2.C.4）
 *
 * - Fastify `reply.raw` 手写 SSE 帧（NestJS 内置 SSE 仅支持 Express）
 * - `Last-Event-ID` 优先于 query.lastEventId；带 id 时先回放 Stream（MAXLEN 1000 窗口）再接实时流
 * - 15s 空注释行心跳，防止代理切断
 * - 每 projectId 超出 REALTIME_MAX_CONN_PER_PROJECT 直接 429
 * - `reply.raw.on('close')` 清理订阅 + 心跳 interval，防止泄漏
 */
@ApiTags("realtime")
@Controller("api/v1/stream")
export class RealtimeController {
  public constructor(private readonly realtime: RealtimeService) {}

  @Get("realtime")
  @UsePipes(new ZodValidationPipe(RealtimeStreamQuerySchema))
  @ApiOperation({
    summary:
      "实时监控 SSE：订阅 error/api/perf 三个 topic；Last-Event-ID 回放 60s 窗口",
  })
  @ApiQuery({ name: "projectId", required: true, type: String })
  @ApiQuery({
    name: "topics",
    required: false,
    type: String,
    description: "逗号分隔，如 `error,api`；缺省订阅全部 3 个",
  })
  @ApiQuery({ name: "lastEventId", required: false, type: String })
  public async stream(
    @Query() query: RealtimeStreamQuery,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const headerLastId = req.headers["last-event-id"];
    const lastEventId =
      (typeof headerLastId === "string" ? headerLastId : undefined) ??
      query.lastEventId;

    // 先尝试注册订阅者；超限立即 429（此时还未写任何 SSE header）
    // 注意：listener 必须同步可用 —— 先准备 writer 再注册
    const raw = reply.raw;
    // EventSource 跨域时浏览器可能不发 Origin；直接允许请求来源或回退通配
    const origin = (req.headers.origin as string | undefined) ?? "*";
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": origin !== "*" ? "true" : undefined,
    });
    // Fastify 需要主动切到 hijack 语义，否则框架会再写一次响应
    reply.hijack();

    const writeEvent = (id: string, payload: RealtimePayload): void => {
      if (raw.writableEnded) return;
      // SSE 规范：event: <name>\n id: <id>\n data: <json>\n\n
      const frame =
        `event: ${payload.topic}\n` +
        `id: ${id}\n` +
        `data: ${JSON.stringify(payload)}\n\n`;
      // backpressure：writable 返回 false 时忽略（下帧直接丢弃，避免堆积）
      raw.write(frame);
    };

    const off = this.realtime.subscribe(
      query.projectId,
      query.topics,
      writeEvent,
    );
    if (!off) {
      // 超限：写 SSE 错误事件后结束
      raw.write(
        `event: error\n` +
          `data: ${JSON.stringify({ code: "SUBSCRIBER_LIMIT" })}\n\n`,
      );
      raw.end();
      throw new HttpException(
        { error: "SUBSCRIBER_LIMIT", message: "realtime subscribers exhausted" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 心跳：15s 空注释行
    const heartbeat = setInterval(() => {
      if (raw.writableEnded) return;
      raw.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    heartbeat.unref?.();

    // Last-Event-ID 回放：读取 Stream 窗口内该 id 之后的条目一次性写出
    if (lastEventId) {
      try {
        const replay = await this.realtime.replayAfter(
          query.projectId,
          lastEventId,
          query.topics,
        );
        for (const entry of replay) {
          writeEvent(entry.id, entry.payload);
        }
      } catch {
        /* 回放失败不影响后续实时推送 */
      }
    }

    // 初始 connection ack（触发浏览器 onopen）
    raw.write(`: connected ${Date.now()}\n\n`);

    // 客户端断连清理
    raw.on("close", () => {
      clearInterval(heartbeat);
      off();
    });
  }
}
