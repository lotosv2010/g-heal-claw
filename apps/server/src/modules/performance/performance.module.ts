import { Module } from "@nestjs/common";
import { PerformanceService } from "./performance.service.js";

/**
 * 性能数据持久化模块（ADR-0013）
 *
 * 骨架阶段由 GatewayService 直接注入 PerformanceService；T1.3.2 迁到 ProcessorModule。
 */
@Module({
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
