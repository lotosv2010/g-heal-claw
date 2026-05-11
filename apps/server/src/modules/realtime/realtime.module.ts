import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RealtimeController } from "./realtime.controller.js";
import { RealtimeService } from "./realtime.service.js";

/**
 * RealtimeModule
 *
 * 职责：平台实时大盘的 Pub/Sub 订阅池 + Redis Streams 回放 + SSE 推送基础设施。
 *
 * - 仅导出 RealtimeService（供 Gateway publish 与后续 Controller 订阅）
 * - Redis 连接复用 RedisService（全局模块），另建一条独立 subscriber 连接
 * - RealtimeController 提供 SSE 端点（需 JWT 认证）
 */
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
