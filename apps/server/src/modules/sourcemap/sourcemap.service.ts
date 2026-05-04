import { Inject, Injectable, Logger } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { ErrorEvent, StackFrame } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { STORAGE_SERVICE, type StorageService } from "./storage.service.js";

// source-map v0.7 WASM 异步加载
type SourceMapConsumerType = import("source-map").SourceMapConsumer;
let SourceMapConsumer: typeof import("source-map").SourceMapConsumer;

async function loadSourceMap(): Promise<void> {
  if (SourceMapConsumer) return;
  const mod = await import("source-map");
  SourceMapConsumer = mod.SourceMapConsumer;
}

/**
 * Sourcemap 堆栈还原（ADR-0031 §5）
 *
 * LRU 缓存 SourceMapConsumer，evict 时调 .destroy() 释放 WASM 内存。
 * 任何环节失败 → 原样返回对应 frame，永不抛错。
 */
@Injectable()
export class SourcemapService {
  private readonly logger = new Logger(SourcemapService.name);
  private readonly cache: LRUCache<string, SourceMapConsumerType>;

  public constructor(
    private readonly database: DatabaseService,
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {
    this.cache = new LRUCache<string, SourceMapConsumerType>({
      max: this.env.SOURCEMAP_LRU_CAPACITY ?? 100,
      ttl: 60 * 60 * 1000, // 1h
      dispose: (consumer) => {
        try {
          consumer.destroy();
        } catch {
          // WASM dispose 偶尔抛错，静默吞掉
        }
      },
    });
  }

  /**
   * 对一批 ErrorEvent 执行 Sourcemap 还原
   *
   * 契约：readonly 输入 → readonly 输出，永不抛错
   */
  public async resolveFrames(
    events: readonly ErrorEvent[],
  ): Promise<readonly ErrorEvent[]> {
    if (events.length === 0) return events;

    try {
      await loadSourceMap();
    } catch (err) {
      this.logger.warn(`source-map WASM 加载失败，跳过还原: ${err}`);
      return events;
    }

    const results: ErrorEvent[] = [];
    for (const event of events) {
      results.push(await this.resolveEvent(event));
    }
    return results;
  }

  private async resolveEvent(event: ErrorEvent): Promise<ErrorEvent> {
    // 无 frames 或无 release → 原样返回
    if (!event.frames || event.frames.length === 0 || !event.release) {
      return event;
    }

    const projectId = event.projectId;
    if (!projectId) return event;

    const resolvedFrames: StackFrame[] = [];
    for (const frame of event.frames) {
      resolvedFrames.push(
        await this.resolveFrame(projectId, event.release, frame),
      );
    }

    return { ...event, frames: resolvedFrames };
  }

  private async resolveFrame(
    projectId: string,
    release: string,
    frame: StackFrame,
  ): Promise<StackFrame> {
    try {
      if (!frame.file || frame.line === undefined || frame.line === null) {
        return frame;
      }

      const consumer = await this.getConsumer(projectId, release, frame.file);
      if (!consumer) return frame;

      const original = consumer.originalPositionFor({
        line: frame.line,
        column: frame.column ?? 0,
      });

      if (!original.source) return frame;

      return {
        file: original.source,
        function: original.name ?? frame.function,
        line: original.line ?? undefined,
        column: original.column ?? undefined,
      };
    } catch (err) {
      this.logger.warn(
        `resolveFrame 失败 file=${frame.file} line=${frame.line}: ${err}`,
      );
      return frame;
    }
  }

  private async getConsumer(
    projectId: string,
    release: string,
    filename: string,
  ): Promise<SourceMapConsumerType | null> {
    const cacheKey = `${projectId}:${release}:${filename}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // 查 release_artifacts 表
    const db = this.database.db;
    if (!db) return null;

    const rows = await db.execute<{ storage_key: string }>(sql`
      SELECT ra.storage_key
      FROM release_artifacts ra
      JOIN releases r ON r.id = ra.release_id
      WHERE r.project_id = ${projectId}
        AND r.version = ${release}
        AND ra.filename = ${filename}
      LIMIT 1
    `);

    if (rows.length === 0) {
      this.logger.debug?.(
        `artifact 不存在 project=${projectId} release=${release} file=${filename}`,
      );
      return null;
    }

    // 从 MinIO 读取 .map 文件
    const mapBuffer = await this.storage.get(rows[0].storage_key);
    if (!mapBuffer) {
      this.logger.warn(
        `storage.get 失败 key=${rows[0].storage_key}`,
      );
      return null;
    }

    try {
      const rawMap = JSON.parse(mapBuffer.toString("utf-8")) as import("source-map").RawSourceMap;
      const consumer = await new SourceMapConsumer(rawMap);
      this.cache.set(cacheKey, consumer);
      return consumer;
    } catch (err) {
      this.logger.warn(
        `SourceMapConsumer 解析失败 key=${rows[0].storage_key}: ${err}`,
      );
      return null;
    }
  }
}
