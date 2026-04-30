import { Module, type DynamicModule } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import type { ServerEnv } from "./config/env.js";
import { SharedModule } from "./shared/shared.module.js";
import { HealthModule } from "./health/health.module.js";
import { GatewayModule } from "./gateway/gateway.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { ErrorsModule } from "./errors/errors.module.js";
import { ApiMonitorModule } from "./api-monitor/api-monitor.module.js";
import { TrackingModule } from "./tracking/tracking.module.js";
import { ResourceMonitorModule } from "./resource-monitor/resource-monitor.module.js";
import { CustomModule } from "./custom/custom.module.js";
import { LogsModule } from "./logs/logs.module.js";

@Module({})
export class AppModule {
  public static forRoot(env: ServerEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        SharedModule,
        HealthModule,
        GatewayModule,
        ErrorsModule,
        ApiMonitorModule,
        TrackingModule,
        ResourceMonitorModule,
        CustomModule,
        LogsModule,
        DashboardModule,
      ],
    };
  }
}
