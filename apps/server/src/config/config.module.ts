import { Global, Module, type DynamicModule } from "@nestjs/common";
import { SERVER_ENV, type ServerEnv } from "./env.js";

/**
 * 全局配置模块
 *
 * 通过 `ConfigModule.forRoot(env)` 在 main.ts 预先加载并传入，避免 Nest DI
 * 启动阶段再次触碰 process.env。
 */
@Global()
@Module({})
export class ConfigModule {
  public static forRoot(env: ServerEnv): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: SERVER_ENV, useValue: env }],
      exports: [SERVER_ENV],
    };
  }
}
