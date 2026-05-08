import { z } from "zod";

/** 埋点事件名最大长度（对齐 DB schema event_name varchar(128)） */
export const TRACK_NAME_MAX_LENGTH = 128;

/** 合法字符：小写字母、数字、下划线；推荐 <domain>_<action> 格式 */
const VALID_PATTERN = /^[a-z][a-z0-9_]*$/;

/** 推荐格式：至少包含一个下划线分隔 domain 和 action */
const RECOMMENDED_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/;

export interface TrackNameIssue {
  readonly name: string;
  readonly rule: "empty" | "too_long" | "invalid_chars" | "no_separator" | "starts_with_underscore" | "consecutive_underscores" | "ends_with_underscore";
  readonly message: string;
  readonly severity: "error" | "warn";
}

/**
 * 校验埋点事件名是否合规
 *
 * 规则（error 级别，必须修复）：
 * - 非空
 * - 长度 ≤ 128
 * - 仅允许小写字母、数字、下划线
 * - 不以下划线开头
 * - 不包含连续下划线
 * - 不以下划线结尾
 *
 * 建议（warn 级别，推荐修复）：
 * - 包含至少一个下划线（<domain>_<action> 格式）
 */
export function validateTrackName(name: string): readonly TrackNameIssue[] {
  const issues: TrackNameIssue[] = [];

  if (!name || name.trim().length === 0) {
    issues.push({ name, rule: "empty", message: "事件名不能为空", severity: "error" });
    return issues;
  }

  if (name.length > TRACK_NAME_MAX_LENGTH) {
    issues.push({ name, rule: "too_long", message: `事件名超过 ${TRACK_NAME_MAX_LENGTH} 字符（当前 ${name.length}）`, severity: "error" });
  }

  if (!VALID_PATTERN.test(name)) {
    issues.push({ name, rule: "invalid_chars", message: "事件名仅允许小写字母、数字和下划线，且必须以小写字母开头", severity: "error" });
  }

  if (name.startsWith("_")) {
    issues.push({ name, rule: "starts_with_underscore", message: "事件名不能以下划线开头", severity: "error" });
  }

  if (name.includes("__")) {
    issues.push({ name, rule: "consecutive_underscores", message: "事件名不能包含连续下划线", severity: "error" });
  }

  if (name.endsWith("_")) {
    issues.push({ name, rule: "ends_with_underscore", message: "事件名不能以下划线结尾", severity: "error" });
  }

  if (issues.length === 0 && !RECOMMENDED_PATTERN.test(name)) {
    issues.push({ name, rule: "no_separator", message: "建议使用 <domain>_<action> 格式（如 checkout_submit）", severity: "warn" });
  }

  return issues;
}

/** Zod Schema 形式的事件名校验（可在运行时管道中直接使用） */
export const TrackNameSchema = z.string()
  .min(1, "事件名不能为空")
  .max(TRACK_NAME_MAX_LENGTH, `事件名超过 ${TRACK_NAME_MAX_LENGTH} 字符`)
  .regex(VALID_PATTERN, "事件名仅允许小写字母、数字和下划线，且必须以小写字母开头")
  .refine((v) => !v.includes("__"), "事件名不能包含连续下划线")
  .refine((v) => !v.endsWith("_"), "事件名不能以下划线结尾");
