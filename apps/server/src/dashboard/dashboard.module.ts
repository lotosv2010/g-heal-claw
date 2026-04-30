import { Module } from "@nestjs/common";
import { ApiModule } from "../modules/api/api.module.js";
import { CustomModule } from "../modules/custom/custom.module.js";
import { ErrorsModule } from "../modules/errors/errors.module.js";
import { LogsModule } from "../modules/logs/logs.module.js";
import { PerformanceModule } from "../modules/performance/performance.module.js";
import { ResourcesModule } from "../modules/resources/resources.module.js";
import { TrackingModule } from "../modules/tracking/tracking.module.js";
import { VisitsModule } from "../modules/visits/visits.module.js";
import { DashboardApiController } from "./monitor/api.controller.js";
import { DashboardApiService } from "./monitor/api.service.js";
import { DashboardErrorsController } from "./monitor/errors.controller.js";
import { DashboardErrorsService } from "./monitor/errors.service.js";
import { DashboardLogsController } from "./monitor/logs.controller.js";
import { DashboardLogsService } from "./monitor/logs.service.js";
import { DashboardPerformanceController } from "./monitor/performance.controller.js";
import { DashboardPerformanceService } from "./monitor/performance.service.js";
import { DashboardResourcesController } from "./monitor/resources.controller.js";
import { DashboardResourcesService } from "./monitor/resources.service.js";
import { DashboardVisitsController } from "./monitor/visits.controller.js";
import { DashboardVisitsService } from "./monitor/visits.service.js";
import { DashboardCustomController } from "./tracking/custom.controller.js";
import { DashboardCustomService } from "./tracking/custom.service.js";
import { DashboardExposureController } from "./tracking/exposure.controller.js";
import { DashboardExposureService } from "./tracking/exposure.service.js";
import { DashboardFunnelController } from "./tracking/funnel.controller.js";
import { DashboardFunnelService } from "./tracking/funnel.service.js";
import { DashboardRetentionController } from "./tracking/retention.controller.js";
import { DashboardRetentionService } from "./tracking/retention.service.js";
import { DashboardTrackingController } from "./tracking/tracking.controller.js";
import { DashboardTrackingService } from "./tracking/tracking.service.js";

/**
 * Dashboard 前端数据聚合模块（ADR-0015 + ADR-0016 §3 + ADR-0020 §4.2 + ADR-0022 §4 + P0-3 §2）
 *
 * 依赖各领域 Module 暴露的 Service 做 DB 聚合；不引入任何队列或 ETL，保持"只读视图层"定位。
 */
@Module({
  imports: [
    PerformanceModule,
    ErrorsModule,
    ApiModule,
    TrackingModule,
    ResourcesModule,
    CustomModule,
    LogsModule,
    VisitsModule,
  ],
  controllers: [
    DashboardPerformanceController,
    DashboardErrorsController,
    DashboardApiController,
    DashboardTrackingController,
    DashboardExposureController,
    DashboardFunnelController,
    DashboardRetentionController,
    DashboardResourcesController,
    DashboardCustomController,
    DashboardLogsController,
    DashboardVisitsController,
  ],
  providers: [
    DashboardPerformanceService,
    DashboardErrorsService,
    DashboardApiService,
    DashboardTrackingService,
    DashboardExposureService,
    DashboardFunnelService,
    DashboardRetentionService,
    DashboardResourcesService,
    DashboardCustomService,
    DashboardLogsService,
    DashboardVisitsService,
  ],
})
export class DashboardModule {}
