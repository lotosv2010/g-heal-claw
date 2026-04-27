import { Module } from "@nestjs/common";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { DashboardErrorsController } from "./errors.controller.js";
import { DashboardErrorsService } from "./errors.service.js";
import { DashboardPerformanceController } from "./performance.controller.js";
import { DashboardPerformanceService } from "./performance.service.js";

/**
 * Dashboard 前端数据聚合模块（ADR-0015 + ADR-0016 §3）
 *
 * 依赖 PerformanceModule / ErrorsModule 暴露的 Service 做 DB 聚合；
 * 不引入任何队列或 ETL，保持"只读视图层"定位。
 */
@Module({
  imports: [PerformanceModule, ErrorsModule],
  controllers: [DashboardPerformanceController, DashboardErrorsController],
  providers: [DashboardPerformanceService, DashboardErrorsService],
})
export class DashboardModule {}
