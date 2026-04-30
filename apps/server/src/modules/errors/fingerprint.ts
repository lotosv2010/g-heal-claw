import { createHash } from "node:crypto";
import type { ErrorEvent } from "@g-heal-claw/shared";

/**
 * 指纹计算（ADR-0016 §3；T1.4.1 合并 T1.4.2 范围）
 *
 * 规则：`sha1(subType + '|' + normalize(message) + '|' + topFrameFile + '|' + topFrameFunction)`
 *
 * 归一化（normalize）目的：抹掉高熵噪声，让"同一 Issue 的变体事件"指纹一致：
 *  - 十六进制 / UUID / 纯数字 ID → 占位符 {id}
 *  - URL query string → 仅保留 path
 *  - 绝对路径 / file:/// → 取 basename
 *  - 多余空白 → 单空格
 *
 * 无 frames 时 topFrameFile/function 为空串；仍可唯一标识纯 subType+message 的事件族。
 *
 * 返回 40 字符十六进制字符串；适配 issues.fingerprint varchar(64)。
 */
export function computeFingerprint(event: ErrorEvent): string {
  const parts = [
    event.subType,
    normalizeMessage(event.message ?? ""),
    topFrameFile(event),
    topFrameFunction(event),
  ];
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

/** 规范化 message：抹掉 UUID / 十六进制地址 / 长数字 / URL query / 绝对路径 */
export function normalizeMessage(msg: string): string {
  return msg
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "{uuid}",
    )
    .replace(/\b0x[0-9a-f]{4,}\b/gi, "{hex}")
    .replace(/\b\d{4,}\b/g, "{num}")
    .replace(/https?:\/\/[^\s]+/gi, (u) => {
      try {
        const url = new URL(u);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "{url}";
      }
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 512);
}

function topFrameFile(event: ErrorEvent): string {
  const first = event.frames?.[0];
  if (!first?.file) return "";
  return basename(first.file);
}

function topFrameFunction(event: ErrorEvent): string {
  return event.frames?.[0]?.function ?? "";
}

/** URL / 路径的 basename：去 query、去目录、保留末段文件名 */
function basename(path: string): string {
  const noQuery = path.split("?")[0] ?? path;
  const segments = noQuery.split(/[/\\]/);
  return segments[segments.length - 1] ?? noQuery;
}

/** 标题截断：issues.title 是 text，但限制 200 避免列表渲染抖动 */
const TITLE_MAX = 200;

export function buildIssueTitle(event: ErrorEvent): string {
  return (event.message ?? "").slice(0, TITLE_MAX) || event.subType;
}
