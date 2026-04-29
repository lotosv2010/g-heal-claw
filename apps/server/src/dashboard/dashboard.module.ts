import { Module } from "@nestjs/common";
import { ApiMonitorModule } from "../api-monitor/api-monitor.module.js";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { ResourceMonitorModule } from "../resource-monitor/resource-monitor.module.js";
import { TrackingModule } from "../tracking/tracking.module.js";
import { DashboardApiController } from "./api.controller.js";
import { DashboardApiService } from "./api.service.js";
import { DashboardErrorsController } from "./errors.controller.js";
import { DashboardErrorsService } from "./errors.service.js";
import { DashboardPerformanceController } from "./performance.controller.js";
import { DashboardPerformanceService } from "./performance.service.js";
import { DashboardResourcesController } from "./resources.controller.js";
import { DashboardResourcesService } from "./resources.service.js";
import { DashboardTrackingController } from "./tracking.controller.js";
import { DashboardTrackingService } from "./tracking.service.js";

/**
 * Dashboard 前端数据聚合模块（ADR-0015 + ADR-0016 §3 + ADR-0020 §4.2 + ADR-0022 §4 + P0-3 §2）
 *
 * 依赖各领域 Module 暴露的 Service 做 DB 聚合；不引入任何队列或 ETL，保持"只读视图层"定位。
 */
@Module({
  imports: [
    PerformanceModule,
    ErrorsModule,
    ApiMonitorModule,
    TrackingModule,
    ResourceMonitorModule,
  ],
  controllers: [
    DashboardPerformanceController,
    DashboardErrorsController,
    DashboardApiController,
    DashboardTrackingController,
    DashboardResourcesController,
  ],
  providers: [
    DashboardPerformanceService,
    DashboardErrorsService,
    DashboardApiService,
    DashboardTrackingService,
    DashboardResourcesService,
  ],
})
export class DashboardModule {}
