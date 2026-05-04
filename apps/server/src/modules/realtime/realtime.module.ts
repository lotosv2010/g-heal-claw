import { Module } from "@nestjs/common";
import { RealtimeController } from "./realtime.controller.js";
import { RealtimeService } from "./realtime.service.js";

/**
 * RealtimeModule（ADR-0030 §6 / TM.2.C）
 *
 * 职责：平台实时大盘的 Pub/Sub 订阅池 + Redis Streams 回放 + SSE 推送基础设施。
 *
 * - 仅导出 RealtimeService（供 Gateway publish 与后续 Controller 订阅）
 * - Redis 连接复用 RedisService（全局模块），另建一条独立 subscriber 连接
 * - 不持有任何 HTTP Controller（SSE Controller 将在 TM.2.C.4 挂到 GatewayController 同路由组）
 */
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
