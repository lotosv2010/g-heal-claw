import { Module } from "@nestjs/common";
import { PerformanceModule } from "../performance/performance.module.js";
import { GatewayController } from "./gateway.controller.js";
import { GatewayService } from "./gateway.service.js";

@Module({
  imports: [PerformanceModule],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
