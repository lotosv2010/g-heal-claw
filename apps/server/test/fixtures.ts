import type { CustomLog } from "@g-heal-claw/shared";

/**
 * 测试夹具：生成一条最小可通过 Zod 校验的 custom_log 事件
 *
 * 放在 test/ 目录以便 service spec 与 e2e spec 共享，避免每个用例重复构造。
 */
export function buildCustomLogEvent(
  overrides: Partial<CustomLog> = {},
): CustomLog {
  return {
    // 合法 UUIDv4：zod v4 `z.uuid()` 要求 version=1~8、variant=8/9/a/b
    eventId: "11111111-2222-4333-8444-555555555555",
    projectId: "demo",
    publicKey: "pk",
    timestamp: Date.now(),
    type: "custom_log",
    environment: "test",
    sessionId: "s-demo",
    tags: {},
    context: {},
    device: {
      ua: "vitest",
      os: "Linux",
      browser: "Node",
      deviceType: "desktop",
      screen: { width: 1920, height: 1080, dpr: 1 },
      language: "en-US",
      timezone: "UTC",
    },
    page: {
      url: "http://localhost/",
      path: "/",
    },
    level: "info",
    message: "hello",
    breadcrumbs: [],
    ...overrides,
  };
}
