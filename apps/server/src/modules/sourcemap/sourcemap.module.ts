import { Module } from "@nestjs/common";
import { SourcemapService } from "./sourcemap.service.js";
import { SourcemapController } from "./sourcemap.controller.js";
import { S3StorageService, LocalStorageService, STORAGE_SERVICE } from "./storage.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";

/**
 * SourcemapModule
 *
 * - SourcemapService：resolveFrames
 * - SourcemapController：Release CRUD + Artifact multipart 上传
 * - StorageService：根据 SOURCEMAP_STORAGE 环境变量选择 local / s3
 * - ApiKeyGuard：X-Api-Key 鉴权
 */
@Module({
  controllers: [SourcemapController],
  providers: [
    SourcemapService,
    {
      provide: STORAGE_SERVICE,
      useClass: process.env.SOURCEMAP_STORAGE === "s3" ? S3StorageService : LocalStorageService,
    },
    ApiKeyGuard,
  ],
  exports: [SourcemapService, STORAGE_SERVICE],
})
export class SourcemapModule {}
