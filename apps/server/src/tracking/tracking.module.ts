import { Module } from "@nestjs/common";
import { TrackingService } from "./tracking.service.js";

/**
 * TrackingModule（P0-3 §2）
 *
 * 职责：承载 `trackPlugin`（type='track'）的明细落库 + 聚合查询服务。
 *  - 由 GatewayService 依赖注入调用 `saveBatch`
 *  - 由 DashboardModule 依赖注入调用 `aggregate*`
 *  - DatabaseService 通过 @Global SharedModule 注入
 */
@Module({
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
