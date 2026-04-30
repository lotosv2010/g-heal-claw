import { Module } from "@nestjs/common";
import { ResourcesService } from "./resources.service.js";

/**
 * ResourcesModule（ADR-0022 §3 / ADR-0025 命名统一：resource-monitor → resources）
 *
 * 职责：承载 `resourcePlugin`（type='resource'）的明细落库 + 聚合查询服务。
 * - 由 GatewayService 依赖注入调用 `saveBatch`
 * - 由 DashboardModule 依赖注入调用 `aggregate*`
 * - DatabaseService 通过 @Global SharedModule 注入
 */
@Module({
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
