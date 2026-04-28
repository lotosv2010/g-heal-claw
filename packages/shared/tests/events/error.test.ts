import { describe, it, expect } from "vitest";
import {
  ErrorEventSchema,
  ResourceKindSchema,
} from "../../src/events/error.js";

/**
 * ErrorEventSchema 判别测试（ADR-0019）
 *
 * 9 分类由 subType(7) + resource.kind(4) 共同判别：
 *  subType: js / promise / resource / framework / white_screen / ajax / api_code
 *  kind:    js_load / css_load / image_load / media / other
 */

const BASE = {
  eventId: "11111111-1111-4111-8111-111111111111",
  projectId: "proj_1",
  publicKey: "pk_1",
  timestamp: 1700000000000,
  sessionId: "sess_1",
  device: {
    ua: "ua",
    os: "mac",
    browser: "chrome",
    deviceType: "desktop" as const,
    screen: { width: 1920, height: 1080, dpr: 2 },
    language: "zh-CN",
    timezone: "Asia/Shanghai",
  },
  page: {
    url: "https://example.com/home",
    path: "/home",
  },
};

describe("ErrorEventSchema / subType 判别", () => {
  it.each([
    "js",
    "promise",
    "resource",
    "framework",
    "white_screen",
    "ajax",
    "api_code",
  ] as const)("accepts subType=%s", (subType) => {
    const parsed = ErrorEventSchema.safeParse({
      ...BASE,
      type: "error",
      subType,
      message: "boom",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects 未知 subType", () => {
    const parsed = ErrorEventSchema.safeParse({
      ...BASE,
      type: "error",
      subType: "unknown",
      message: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects type != 'error'", () => {
    const parsed = ErrorEventSchema.safeParse({
      ...BASE,
      type: "performance",
      subType: "js",
      message: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ResourceKindSchema 与 ajax/api_code request 字段", () => {
  it.each(["js_load", "css_load", "image_load", "media", "other"] as const)(
    "accepts resource.kind=%s",
    (kind) => {
      const parsed = ResourceKindSchema.safeParse(kind);
      expect(parsed.success).toBe(true);
    },
  );

  it("ajax 携带 request.status=0（网络层失败）", () => {
    const parsed = ErrorEventSchema.safeParse({
      ...BASE,
      type: "error",
      subType: "ajax",
      message: "Ajax failed",
      request: {
        url: "https://api.example.com/x",
        method: "GET",
        status: 0,
        statusText: "network error",
        durationMs: 30,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("api_code 携带 bizCode 为字符串/数字皆可", () => {
    for (const bizCode of [500, "BIZ_ERR"]) {
      const parsed = ErrorEventSchema.safeParse({
        ...BASE,
        type: "error",
        subType: "api_code",
        message: "biz error",
        request: {
          url: "https://api.example.com/order",
          method: "POST",
          status: 200,
          durationMs: 50,
          bizCode,
          bizMessage: "fail",
        },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("向后兼容：resource.kind 缺失仍通过", () => {
    const parsed = ErrorEventSchema.safeParse({
      ...BASE,
      type: "error",
      subType: "resource",
      message: "Resource load failed",
      resource: { url: "https://cdn/a.png", tagName: "img" },
    });
    expect(parsed.success).toBe(true);
  });
});
