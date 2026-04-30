import { Module } from "@nestjs/common";
import { ApiService } from "./api.service.js";

/**
 * ApiModule（ADR-0020 §4.2 / ADR-0025 命名统一：api-monitor → api）
 *
 * 职责：承载 `apiPlugin`（type='api'）的明细落库 + 聚合查询服务。
 * - 由 GatewayService 依赖注入调用 `saveBatch`
 * - 由 DashboardModule 依赖注入调用 `aggregate*`
 * - DatabaseService 通过 @Global SharedModule 注入
 */
@Module({
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {}
