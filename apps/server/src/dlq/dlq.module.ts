import { Module } from "@nestjs/common";
import { DeadLetterService } from "./dead-letter.service.js";

/**
 * DLQ 模块（T1.4.4 / ADR-0016 §5）
 *
 * 暴露 DeadLetterService 供 ErrorsModule / PerformanceModule 在落库失败路径兜底调用。
 */
@Module({
  providers: [DeadLetterService],
  exports: [DeadLetterService],
})
export class DlqModule {}
