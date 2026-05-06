import { Module, type DynamicModule } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "./config/config.module.js";
import type { ServerEnv } from "./config/env.js";
import { SharedModule } from "./shared/shared.module.js";
import { buildLoggerConfig } from "./shared/logger/logger.config.js";
import { HealthModule } from "./health/health.module.js";
import { GatewayModule } from "./gateway/gateway.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { ErrorsModule } from "./modules/errors/errors.module.js";
import { ApiModule } from "./modules/api/api.module.js";
import { TrackingModule } from "./modules/tracking/tracking.module.js";
import { ResourcesModule } from "./modules/resources/resources.module.js";
import { CustomModule } from "./modules/custom/custom.module.js";
import { LogsModule } from "./modules/logs/logs.module.js";
import { VisitsModule } from "./modules/visits/visits.module.js";
import { PartitionsModule } from "./modules/partitions/partitions.module.js";
import { RealtimeModule } from "./modules/realtime/realtime.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";

@Module({})
export class AppModule {
  public static forRoot(env: ServerEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerConfig()),
        SharedModule,
        // TM.E.5：全局注册 @nestjs/schedule，供 PartitionMaintenance 等模块使用
        ScheduleModule.forRoot(),
        HealthModule,
        AuthModule,
        GatewayModule,
        ErrorsModule,
        ApiModule,
        TrackingModule,
        ResourcesModule,
        CustomModule,
        LogsModule,
        VisitsModule,
        PartitionsModule,
        RealtimeModule,
        DashboardModule,
      ],
    };
  }
}
