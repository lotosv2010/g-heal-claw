import { Module } from "@nestjs/common";
import { ResourceMonitorService } from "./resource-monitor.service.js";

/**
 * ResourceMonitorModule（ADR-0022 §3）
 *
 * 职责：承载 `resourcePlugin`（type='resource'）的明细落库 + 聚合查询服务。
 * - 由 GatewayService 依赖注入调用 `saveBatch`
 * - 由 DashboardModule 依赖注入调用 `aggregate*`
 * - DatabaseService 通过 @Global SharedModule 注入
 */
@Module({
  providers: [ResourceMonitorService],
  exports: [ResourceMonitorService],
})
export class ResourceMonitorModule {}
