import { Module } from "@nestjs/common";
import { CustomEventsService } from "./custom-events.service.js";
import { CustomMetricsService } from "./custom-metrics.service.js";

/**
 * CustomModule（ADR-0023 §4）
 *
 * 承载自定义业务埋点（type='custom_event'）与自定义测速（type='custom_metric'）的
 * 落库 + 聚合能力。与 TrackingModule（trackPlugin 被动 DOM 采集）在 type 维度完全独立。
 * DatabaseService 通过 @Global SharedModule 注入。
 */
@Module({
  providers: [CustomEventsService, CustomMetricsService],
  exports: [CustomEventsService, CustomMetricsService],
})
export class CustomModule {}
