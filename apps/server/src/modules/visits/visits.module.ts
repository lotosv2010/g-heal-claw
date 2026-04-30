import { Module } from "@nestjs/common";
import { VisitsService } from "./visits.service.js";

/**
 * VisitsModule（ADR-0020 Tier 2.A）
 *
 * 职责：承载 `pageViewPlugin`（type='page_view'）的明细落库 + 聚合查询服务。
 * - 由 GatewayService 依赖注入调用 `saveBatch`
 * - 由 DashboardModule（monitor/visits）依赖注入调用 `aggregate*`
 */
@Module({
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
