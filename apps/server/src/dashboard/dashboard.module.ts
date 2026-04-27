import { Module } from "@nestjs/common";
import { PerformanceModule } from "../performance/performance.module.js";
import { DashboardPerformanceController } from "./performance.controller.js";
import { DashboardPerformanceService } from "./performance.service.js";

/**
 * Dashboard 前端数据聚合模块（ADR-0015）
 *
 * 依赖 PerformanceModule 暴露的 PerformanceService 做 DB 聚合；
 * 不引入任何队列或 ETL，保持"只读视图层"定位。
 */
@Module({
  imports: [PerformanceModule],
  controllers: [DashboardPerformanceController],
  providers: [DashboardPerformanceService],
})
export class DashboardModule {}
