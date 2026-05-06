import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { ErrorProcessor, type ErrorJobPayload } from "../../../src/modules/errors/error.processor.js";
import type { ErrorsService } from "../../../src/modules/errors/errors.service.js";
import type { SourcemapService } from "../../../src/modules/sourcemap/sourcemap.service.js";
import type { DeadLetterService } from "../../../src/dlq/dead-letter.service.js";
import type { ServerEnv } from "../../../src/config/env.js";
import { buildErrorEvent } from "../../fixtures.js";

/**
 * ErrorProcessor 单测（TM.E.4 / ADR-0026）
 *
 * 覆盖链路：
 *  1. 成功路径：sourcemap.resolveFrames → errors.saveBatch 被调用，返回 persisted 数
 *  2. errors.saveBatch 抛错 → process() 抛错（交给 BullMQ 重试机制）
 *  3. @OnWorkerEvent('failed') 终态：事件批次入 DLQ，stage=error-raw-insert
 *  4. 非终态失败：不入 DLQ（交给 BullMQ 继续重试）
 */

function buildEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    ERROR_PROCESSOR_ATTEMPTS: 3,
    ERROR_PROCESSOR_BACKOFF_MS: 2000,
    ...overrides,
  } as unknown as ServerEnv;
}

function buildJob(overrides: {
  events?: readonly ReturnType<typeof buildErrorEvent>[];
  attemptsMade?: number;
  attempts?: number;
} = {}): Job<ErrorJobPayload> {
  const events = overrides.events ?? [buildErrorEvent()];
  return {
    id: "job-1",
    data: { events, enqueuedAt: Date.now() - 10 },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job<ErrorJobPayload>;
}

describe("ErrorProcessor", () => {
  it("成功路径：resolveFrames → saveBatch，返回 persisted", async () => {
    const events = [buildErrorEvent()];
    const sourcemap = {
      resolveFrames: vi.fn(async (evs: readonly typeof events[number][]) => evs),
    } as unknown as SourcemapService;
    const errors = {
      saveBatch: vi.fn(async () => 1),
    } as unknown as ErrorsService;
    const dlq = { enqueueEvents: vi.fn() } as unknown as DeadLetterService;

    const processor = new ErrorProcessor(buildEnv(), errors, sourcemap, dlq);
    const result = await processor.process(buildJob({ events }));

    expect(result.persisted).toBe(1);
    expect(sourcemap.resolveFrames).toHaveBeenCalledTimes(1);
    expect(errors.saveBatch).toHaveBeenCalledTimes(1);
    expect(dlq.enqueueEvents).not.toHaveBeenCalled();
  });

  it("空事件短路返回 0，不调用下游", async () => {
    const sourcemap = { resolveFrames: vi.fn() } as unknown as SourcemapService;
    const errors = { saveBatch: vi.fn() } as unknown as ErrorsService;
    const dlq = { enqueueEvents: vi.fn() } as unknown as DeadLetterService;

    const processor = new ErrorProcessor(buildEnv(), errors, sourcemap, dlq);
    const result = await processor.process(buildJob({ events: [] }));

    expect(result.persisted).toBe(0);
    expect(sourcemap.resolveFrames).not.toHaveBeenCalled();
    expect(errors.saveBatch).not.toHaveBeenCalled();
  });

  it("saveBatch 抛错 → process() 抛错（交给 BullMQ 重试）", async () => {
    const sourcemap = {
      resolveFrames: vi.fn(async (evs: readonly unknown[]) => evs),
    } as unknown as SourcemapService;
    const errors = {
      saveBatch: vi.fn(async () => {
        throw new Error("DB 爆炸");
      }),
    } as unknown as ErrorsService;
    const dlq = { enqueueEvents: vi.fn() } as unknown as DeadLetterService;

    const processor = new ErrorProcessor(buildEnv(), errors, sourcemap, dlq);
    await expect(processor.process(buildJob())).rejects.toThrow("DB 爆炸");
    // process() 抛错时 DLQ 不应同步触发（由 onFailed 钩子终态处理）
    expect(dlq.enqueueEvents).not.toHaveBeenCalled();
  });

  it("onFailed 终态（attemptsMade=attempts）→ 事件入 DLQ", async () => {
    const events = [buildErrorEvent()];
    const sourcemap = { resolveFrames: vi.fn() } as unknown as SourcemapService;
    const errors = { saveBatch: vi.fn() } as unknown as ErrorsService;
    const enqueueEvents = vi.fn(async () => 1);
    const dlq = { enqueueEvents } as unknown as DeadLetterService;

    const processor = new ErrorProcessor(buildEnv(), errors, sourcemap, dlq);
    await processor.onFailed(
      buildJob({ events, attemptsMade: 3, attempts: 3 }),
      new Error("彻底失败"),
    );

    expect(enqueueEvents).toHaveBeenCalledTimes(1);
    expect(enqueueEvents).toHaveBeenCalledWith(
      events,
      "error-raw-insert",
      expect.stringContaining("processor-exhausted"),
    );
  });

  it("onFailed 非终态（attemptsMade<attempts）→ 不入 DLQ", async () => {
    const sourcemap = { resolveFrames: vi.fn() } as unknown as SourcemapService;
    const errors = { saveBatch: vi.fn() } as unknown as ErrorsService;
    const enqueueEvents = vi.fn();
    const dlq = { enqueueEvents } as unknown as DeadLetterService;

    const processor = new ErrorProcessor(buildEnv(), errors, sourcemap, dlq);
    await processor.onFailed(
      buildJob({ attemptsMade: 1, attempts: 3 }),
      new Error("临时失败"),
    );

    expect(enqueueEvents).not.toHaveBeenCalled();
  });
});
