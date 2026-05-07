import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { AuthModule } from "../auth/auth.module.js";
import { HealService } from "./heal.service.js";
import { HealController } from "./heal.controller.js";
import { HealResultWorker } from "./heal-result.worker.js";

/**
 * HealModule（Phase 5 · T5.2.1）
 *
 * AI 自愈触发 + 状态查询 + 结果回写
 * - HealService：创建 heal_job + 入队 ai-diagnosis + 状态查询
 * - HealController：RESTful API 端点
 * - HealResultWorker：消费 ai-heal-fix 队列，更新 job 终态
 */
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: QueueName.AiDiagnosis }),
    BullModule.registerQueue({ name: QueueName.AiHealFix }),
  ],
  controllers: [HealController],
  providers: [HealService, HealResultWorker],
  exports: [HealService],
})
export class HealModule {}
