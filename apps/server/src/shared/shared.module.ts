import { Global, Logger, Module } from "@nestjs/common";

/**
 * 全局基础设施模块（骨架版）
 *
 * 目前仅 re-export Nest 自带 Logger，作为所有模块注入 Logger 的统一出口。
 * T1.1.5 会补充 `DatabaseProvider`；T1.3.2 会补充 `BullMQProvider`。
 */
@Global()
@Module({
  providers: [Logger],
  exports: [Logger],
})
export class SharedModule {}
