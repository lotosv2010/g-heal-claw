import { Module } from "@nestjs/common";
import { ApiMonitorModule } from "../api-monitor/api-monitor.module.js";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { TrackingModule } from "../tracking/tracking.module.js";
import { ResourceMonitorModule } from "../resource-monitor/resource-monitor.module.js";
import { DsnAuthGuard } from "./dsn-auth.guard.js";
import { GatewayController } from "./gateway.controller.js";
import { GatewayService } from "./gateway.service.js";
import { IdempotencyService } from "./idempotency.service.js";
import { ProjectKeysService } from "./project-keys.service.js";
import { RateLimitGuard } from "./rate-limit.guard.js";
import { RateLimitService } from "./rate-limit.service.js";

@Module({
  imports: [
    PerformanceModule,
    ErrorsModule,
    ApiMonitorModule,
    TrackingModule,
    ResourceMonitorModule,
  ],
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
