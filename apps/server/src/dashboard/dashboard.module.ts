import { Module } from "@nestjs/common";
import { ApiMonitorModule } from "../api-monitor/api-monitor.module.js";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { TrackingModule } from "../tracking/tracking.module.js";
import { DashboardApiController } from "./api.controller.js";
import { DashboardApiService } from "./api.service.js";
import { DashboardErrorsController } from "./errors.controller.js";
import { DashboardErrorsService } from "./errors.service.js";
import { DashboardPerformanceController } from "./performance.controller.js";
import { DashboardPerformanceService } from "./performance.service.js";
import { DashboardTrackingController } from "./tracking.controller.js";
import { DashboardTrackingService } from "./tracking.service.js";

/**
 * Dashboard 前端数据聚合模块（ADR-0015 + ADR-0016 §3 + ADR-0020 §4.2 + P0-3 §2）
 *
 * 依赖 PerformanceModule / ErrorsModule / ApiMonitorModule / TrackingModule 暴露的 Service
 * 做 DB 聚合；不引入任何队列或 ETL，保持"只读视图层"定位。
 */
@Module({
  imports: [PerformanceModule, ErrorsModule, ApiMonitorModule, TrackingModule],
  controllers: [
    DashboardPerformanceController,
    DashboardErrorsController,
    DashboardApiController,
    DashboardTrackingController,
  ],
  providers: [
    DashboardPerformanceService,
    DashboardErrorsService,
    DashboardApiService,
    DashboardTrackingService,
  ],
})
export class DashboardModule {}
