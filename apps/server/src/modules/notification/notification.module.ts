import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueName } from "@g-heal-claw/shared";
import { AuthModule } from "../auth/auth.module.js";
import { ChannelService } from "./channel.service.js";
import { ChannelController } from "./channel.controller.js";
import { NotificationWorker } from "./notification.worker.js";

/**
 * NotificationModule（ADR-0035 T4.2.1）
 *
 * 通知渠道管理 + 通知分发 Worker：
 * - ChannelService：渠道 CRUD
 * - ChannelController：RESTful API
 * - NotificationWorker：BullMQ 消费通知队列，分发到各渠道
 * - 依赖 AuthModule 提供的 Guard 链
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.Notifications }),
    AuthModule,
  ],
  controllers: [ChannelController],
  providers: [ChannelService, NotificationWorker],
  exports: [ChannelService],
})
export class NotificationModule {}
