import { Module } from "@nestjs/common";
import { SourcemapService } from "./sourcemap.service.js";

/**
 * SourcemapModule（TM.E.3 骨架 · ADR-0026）
 *
 * 当前仅暴露 SourcemapService（resolveFrames stub）。后续 T1.5.3 扩展：
 *  - SourcemapController：/sourcemap/upload 上传接口
 *  - SourcemapStorage：MinIO / S3 抽象
 *  - 缓存层：热点 releaseId 的 source-map-consumer 复用
 */
@Module({
  providers: [SourcemapService],
  exports: [SourcemapService],
})
export class SourcemapModule {}
