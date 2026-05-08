import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AiChatController } from "./ai-chat.controller.js";
import { AiChatService } from "./ai-chat.service.js";

/**
 * AI 对话会话管理模块
 *
 * 职责：会话 CRUD + 消息持久化。
 * LLM 调用由 Next.js API Route 直接处理，本模块不涉及。
 */
@Module({
  imports: [AuthModule],
  controllers: [AiChatController],
  providers: [AiChatService],
  exports: [AiChatService],
})
export class AiChatModule {}
