import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { ApiModule } from "../modules/api/api.module.js";
import { ErrorsModule } from "../modules/errors/errors.module.js";
import { PerformanceModule } from "../modules/performance/performance.module.js";
import { TrackingModule } from "../modules/tracking/tracking.module.js";
import { ResourcesModule } from "../modules/resources/resources.module.js";
import { CustomModule } from "../modules/custom/custom.module.js";
import { LogsModule } from "../modules/logs/logs.module.js";
import { VisitsModule } from "../modules/visits/visits.module.js";
import { RealtimeModule } from "../modules/realtime/realtime.module.js";
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
    ApiModule,
    TrackingModule,
    ResourcesModule,
    CustomModule,
    LogsModule,
    VisitsModule,
    RealtimeModule,
    // TM.E.1：Gateway 作为 events-error 队列 Producer
    BullModule.registerQueue({ name: QueueName.EventsError }),
    // T2.1.4.2：Gateway 作为 events-performance 队列 Producer（ADR-0037）
    BullModule.registerQueue({ name: QueueName.EventsPerformance }),
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
