import { Module } from "@nestjs/common";
import { SourcemapService } from "./sourcemap.service.js";
import { SourcemapController } from "./sourcemap.controller.js";
import { S3StorageService, STORAGE_SERVICE } from "./storage.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";

/**
 * SourcemapModule（ADR-0031）
 *
 * - SourcemapService：resolveFrames（当前 stub，T1.5.3 实装）
 * - SourcemapController：Release CRUD + Artifact multipart 上传
 * - S3StorageService：MinIO/S3 对象存储
 * - ApiKeyGuard：X-Api-Key 鉴权
 */
@Module({
  controllers: [SourcemapController],
  providers: [
    SourcemapService,
    { provide: STORAGE_SERVICE, useClass: S3StorageService },
    ApiKeyGuard,
  ],
  exports: [SourcemapService, STORAGE_SERVICE],
})
export class SourcemapModule {}
