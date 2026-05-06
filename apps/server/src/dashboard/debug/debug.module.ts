import { Module } from "@nestjs/common";
import { SharedModule } from "../../shared/shared.module.js";
import { DebugController } from "./debug.controller.js";

@Module({
  imports: [SharedModule],
  controllers: [DebugController],
})
export class DebugModule {}
