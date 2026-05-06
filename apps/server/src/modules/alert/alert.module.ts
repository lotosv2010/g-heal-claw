import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { AuthModule } from "../auth/auth.module.js";
import { AlertService } from "./alert.service.js";
import { AlertController } from "./alert.controller.js";
import { AlertEvaluatorService } from "./alert-evaluator.service.js";

/**
 * AlertModule（ADR-0035 T4.1.2 / T4.1.3）
 *
 * 告警规则 CRUD + 告警历史查询 + 定时评估引擎
 * - AlertService：规则管理与历史查询
 * - AlertEvaluatorService：每分钟 cron 评估所有启用规则
 * - AlertController：RESTful API 端点
 * - 依赖 AuthModule 提供的 Guard 链（JwtAuthGuard / ProjectGuard / RolesGuard）
 */
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: QueueName.Notifications }),
  ],
  controllers: [AlertController],
  providers: [AlertService, AlertEvaluatorService],
  exports: [AlertService],
})
export class AlertModule {}
