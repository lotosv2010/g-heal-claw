import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../shared/pipes/zod-validation.pipe.js";
import {
  DsnAuthGuard,
  type GatewayAuthContext,
} from "./dsn-auth.guard.js";
import { GatewayService } from "./gateway.service.js";
import { IngestRequestSchema, type IngestRequest } from "./ingest.dto.js";
import { RateLimitGuard } from "./rate-limit.guard.js";

type AuthedRequest = FastifyRequest & { auth?: GatewayAuthContext };

@ApiTags("gateway")
@Controller("ingest/v1")
export class GatewayController {
  public constructor(private readonly gateway: GatewayService) {}

  @Post("events")
  @HttpCode(200)
  // Guard 顺序依赖 req.auth：DsnAuthGuard 必须先执行注入 auth
  @UseGuards(DsnAuthGuard, RateLimitGuard)
  @UsePipes(new ZodValidationPipe(IngestRequestSchema))
  @ApiOperation({ summary: "SDK 批量事件上报入口（DSN 鉴权 + Zod 校验）" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        dsn: { type: "string" },
        sentAt: { type: "number" },
        events: { type: "array", items: { type: "object" } },
      },
      required: ["dsn", "sentAt", "events"],
    },
  })
  public ingest(
    @Body() body: IngestRequest,
    @Req() req: AuthedRequest,
  ): Promise<{ accepted: number; persisted: number; duplicates: number }> {
    return this.gateway.ingest(body, req.auth);
  }
}
