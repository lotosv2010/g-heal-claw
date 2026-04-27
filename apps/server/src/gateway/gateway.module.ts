import { Module } from "@nestjs/common";
import { ErrorsModule } from "../errors/errors.module.js";
import { PerformanceModule } from "../performance/performance.module.js";
import { GatewayController } from "./gateway.controller.js";
import { GatewayService } from "./gateway.service.js";

@Module({
  imports: [PerformanceModule, ErrorsModule],
  controllers: [GatewayController],
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}
