import { Body, Controller, HttpCode, Post, UsePipes } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../shared/pipes/zod-validation.pipe.js";
import { GatewayService } from "./gateway.service.js";
import { IngestRequestSchema, type IngestRequest } from "./ingest.dto.js";

@ApiTags("gateway")
@Controller("ingest/v1")
export class GatewayController {
  public constructor(private readonly gateway: GatewayService) {}

  @Post("events")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(IngestRequestSchema))
  @ApiOperation({ summary: "SDK 批量事件上报入口（骨架：仅校验 + 日志）" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        dsn: { type: "string", nullable: true },
        sentAt: { type: "number" },
        events: { type: "array", items: { type: "object" } },
      },
      required: ["sentAt", "events"],
    },
  })
  public ingest(@Body() body: IngestRequest): { accepted: number } {
    return this.gateway.ingest(body);
  }
}
