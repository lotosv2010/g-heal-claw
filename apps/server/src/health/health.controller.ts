import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("healthz")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Liveness 检查（不校验外部依赖）" })
  public check(): { status: "ok" } {
    return { status: "ok" };
  }
}
