import { Module } from "@nestjs/common";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { DsnAuthGuard } from "./dsn-auth.guard.js";
import { GatewayController } from "./gateway.controller.js";
import { GatewayService } from "./gateway.service.js";
import { IdempotencyService } from "./idempotency.service.js";
import { ProjectKeysService } from "./project-keys.service.js";
import { RateLimitGuard } from "./rate-limit.guard.js";
import { RateLimitService } from "./rate-limit.service.js";

@Module({
  imports: [PerformanceModule, ErrorsModule],
  controllers: [GatewayController],
  providers: [
    GatewayService,
    ProjectKeysService,
    DsnAuthGuard,
    IdempotencyService,
    RateLimitService,
    RateLimitGuard,
  ],
  exports: [GatewayService],
})
export class GatewayModule {}
