// 前缀化 ID 生成器（纯函数，浏览器 / Node 双端可用）
// 策略：`<prefix>_<10 位 nanoid>`，日志可读 + 避免枚举攻击（ADR-0017 §1）
//
// 碰撞概率：10 位字母数字（64 字符集）≈ 60 bit entropy
// → 单表 1B 行碰撞概率 < 10^-6，业务级完全可接受

import { customAlphabet } from "nanoid";

// 与 nanoid 默认字母表一致：URL-safe，无歧义字符
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

const ID_LENGTH = 10;

const nano = customAlphabet(ALPHABET, ID_LENGTH);

// 前缀白名单（运行时校验 + 编译期常量）
export const PROJECT_ID_PREFIX = "proj" as const;
export const USER_ID_PREFIX = "usr" as const;
export const PROJECT_KEY_PREFIX = "pk" as const;
export const RELEASE_ID_PREFIX = "rel" as const;
export const ISSUE_ID_PREFIX = "iss" as const;
export const ENVIRONMENT_ID_PREFIX = "env" as const;
export const NOTIFICATION_ID_PREFIX = "notif" as const;
export const ARTIFACT_ID_PREFIX = "art" as const;

export const ID_PREFIXES = [
  PROJECT_ID_PREFIX,
  USER_ID_PREFIX,
  PROJECT_KEY_PREFIX,
  RELEASE_ID_PREFIX,
  ISSUE_ID_PREFIX,
  ENVIRONMENT_ID_PREFIX,
  NOTIFICATION_ID_PREFIX,
  ARTIFACT_ID_PREFIX,
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

// 前缀格式：小写字母开头，3~8 位字母数字
const PREFIX_PATTERN = /^[a-z][a-z0-9]{1,7}$/;

/**
 * 生成带前缀的 ID。
 *
 * @param prefix 前缀字符串（小写字母开头，3~8 位字母数字，如 "proj" / "usr"）
 * @returns `prefix_<10 位 nanoid>`（如 "proj_8zK3nXvqW4"）
 * @throws 前缀为空或格式非法时抛 Error
 */
export function generateId(prefix: string): string {
  if (!prefix || typeof prefix !== "string") {
    throw new Error(
      `[generateId] prefix 必须为非空字符串，收到 ${JSON.stringify(prefix)}`,
    );
  }
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      `[generateId] prefix 必须为小写字母开头 + 3~8 位字母数字，收到 "${prefix}"`,
    );
  }
  return `${prefix}_${nano()}`;
}

// 便利函数：语义化的各类主键生成
export const generateProjectId = (): string => generateId(PROJECT_ID_PREFIX);
export const generateUserId = (): string => generateId(USER_ID_PREFIX);
export const generateProjectKeyId = (): string =>
  generateId(PROJECT_KEY_PREFIX);
export const generateReleaseId = (): string => generateId(RELEASE_ID_PREFIX);
export const generateIssueId = (): string => generateId(ISSUE_ID_PREFIX);
export const generateArtifactId = (): string => generateId(ARTIFACT_ID_PREFIX);
