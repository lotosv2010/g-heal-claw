import { Module } from "@nestjs/common";
import { PartitionMaintenanceService } from "./partition-maintenance.service.js";

/**
 * 分区维护模块（TM.E.5 / ADR-0026）
 *
 * 依赖 ScheduleModule.forRoot()（在 AppModule 注册一次即可）。
 */
@Module({
  providers: [PartitionMaintenanceService],
  exports: [PartitionMaintenanceService],
})
export class PartitionsModule {}
