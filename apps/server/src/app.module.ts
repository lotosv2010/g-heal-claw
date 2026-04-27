import { Module, type DynamicModule } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import type { ServerEnv } from "./config/env.js";
import { SharedModule } from "./shared/shared.module.js";
import { HealthModule } from "./health/health.module.js";
import { GatewayModule } from "./gateway/gateway.module.js";

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
      ],
    };
  }
}
