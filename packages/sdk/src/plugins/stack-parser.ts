import type { StackFrame } from "@g-heal-claw/shared";

/**
 * 堆栈解析器（T1.2.2.1 / ADR-0016 §1）
 *
 * 纯函数：将 `Error.stack` 文本解析为结构化 `StackFrame[]`。
 *
 * 支持格式：
 * - **V8 / Chromium / Node**：`    at fn (file:line:col)` 或 `    at file:line:col`
 * - **SpiderMonkey / Firefox / Safari**：`fn@file:line:col` 或 `@file:line:col`
 * - **eval 帧**：`    at eval (eval at fn (file:line:col), <anonymous>:line:col)` → 取内层
 *
 * 解析策略：
 * - 逐行扫描，跳过第一行（通常是 `Error: message`）
 * - 帧上限 20，超出丢弃
 * - 任一行解析失败跳过该行，不整体抛错；完全无法识别时返回空数组
 */
const MAX_FRAMES = 20;

/** V8：`    at fn (file:line:col)` */
const V8_FRAME_WITH_FN = /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)\s*$/;
/** V8：`    at file:line:col`（匿名顶层） */
const V8_FRAME_NO_FN = /^\s*at\s+(.+?):(\d+):(\d+)\s*$/;
/** FF / Safari：`fn@file:line:col` 或 `@file:line:col` */
const FF_FRAME = /^(.*?)@(.+?):(\d+):(\d+)\s*$/;

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack || typeof stack !== "string") return [];
  const lines = stack.split("\n");
  const frames: StackFrame[] = [];

  for (const raw of lines) {
    if (frames.length >= MAX_FRAMES) break;
    const line = raw.trim();
    if (!line) continue;

    const frame =
      matchV8WithFn(line) ?? matchV8NoFn(line) ?? matchFirefox(line);
    if (frame) frames.push(frame);
  }

  return frames;
}

function matchV8WithFn(line: string): StackFrame | null {
  const m = V8_FRAME_WITH_FN.exec(line);
  if (!m) return null;
  const [, fn, file, ln, col] = m;
  // eval 帧形如 `eval (eval at fn (file:line:col), <anonymous>:line:col)`；
  // 此处取外层 file/line/col 即可，eval 内层调用栈通常不可恢复
  return makeFrame(file, ln, col, sanitizeFn(fn));
}

function matchV8NoFn(line: string): StackFrame | null {
  // 避免 FF `@file:line:col` 被错误命中（FF 没有 `at ` 前缀）
  if (!line.startsWith("at ")) return null;
  const m = V8_FRAME_NO_FN.exec(line);
  if (!m) return null;
  const [, file, ln, col] = m;
  return makeFrame(file, ln, col, undefined);
}

function matchFirefox(line: string): StackFrame | null {
  const m = FF_FRAME.exec(line);
  if (!m) return null;
  const [, fn, file, ln, col] = m;
  const cleaned = sanitizeFn(fn);
  return makeFrame(file, ln, col, cleaned === "" ? undefined : cleaned);
}

function makeFrame(
  file: string,
  line: string,
  column: string,
  fn: string | undefined,
): StackFrame {
  const frame: StackFrame = {
    file,
    line: toPositiveInt(line),
    column: toPositiveInt(column),
  };
  if (fn) frame.function = fn;
  return frame;
}

function sanitizeFn(fn: string | undefined): string {
  if (!fn) return "";
  // V8 常见噪声：`Object.<anonymous>` / `new Foo` / `async fn` → 保留主名
  return fn
    .replace(/^async\s+/, "")
    .replace(/^new\s+/, "")
    .trim();
}

function toPositiveInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
