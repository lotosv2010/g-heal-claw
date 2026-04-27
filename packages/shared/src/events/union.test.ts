import { describe, it, expect } from "vitest";
import { SdkEventSchema, type SdkEvent } from "./union.js";
import { IngestRequestSchema } from "./ingest.js";

const baseFields = {
  eventId: "00000000-0000-0000-0000-000000000001",
  projectId: "proj_1",
  publicKey: "pk_1",
  timestamp: 1714200000000,
  sessionId: "sess_1",
  device: {
    ua: "Mozilla/5.0",
    os: "macOS",
    browser: "Chrome",
    deviceType: "desktop" as const,
    screen: { width: 1440, height: 900, dpr: 2 },
    language: "zh-CN",
    timezone: "Asia/Shanghai",
  },
  page: {
    url: "https://example.com/page",
    path: "/page",
  },
};

describe("SdkEventSchema 判别联合", () => {
  it("ErrorEvent 通过", () => {
    const evt: SdkEvent = {
      ...baseFields,
      type: "error",
      subType: "js",
      message: "oops",
    };
    expect(SdkEventSchema.safeParse(evt).success).toBe(true);
  });

  it("PerformanceEvent 通过", () => {
    const evt: SdkEvent = {
      ...baseFields,
      type: "performance",
      metric: "LCP",
      value: 2100,
      rating: "good",
    };
    expect(SdkEventSchema.safeParse(evt).success).toBe(true);
  });

  it("ApiEvent 可触发 slow/failed 默认值", () => {
    const out = SdkEventSchema.parse({
      ...baseFields,
      type: "api",
      method: "GET",
      url: "/api/x",
      status: 200,
      duration: 120,
    });
    expect(out.type).toBe("api");
    if (out.type === "api") {
      expect(out.slow).toBe(false);
      expect(out.failed).toBe(false);
    }
  });

  it("TrackEvent properties 默认空对象", () => {
    const out = SdkEventSchema.parse({
      ...baseFields,
      type: "track",
      trackType: "click",
      target: { tag: "button", text: "buy" },
    });
    if (out.type === "track") {
      expect(out.properties).toEqual({});
    }
  });

  it("未知 type 失败", () => {
    const r = SdkEventSchema.safeParse({ ...baseFields, type: "mystery" });
    expect(r.success).toBe(false);
  });

  it("缺失 device 字段失败", () => {
    const { device: _omit, ...rest } = baseFields;
    const r = SdkEventSchema.safeParse({
      ...rest,
      type: "error",
      subType: "js",
      message: "oops",
    });
    expect(r.success).toBe(false);
  });
});

describe("IngestRequestSchema", () => {
  it("events 数组为空时失败", () => {
    const r = IngestRequestSchema.safeParse({
      sentAt: Date.now(),
      events: [],
    });
    expect(r.success).toBe(false);
  });

  it("events 正常批量通过", () => {
    const r = IngestRequestSchema.safeParse({
      sentAt: Date.now(),
      events: [
        {
          ...baseFields,
          type: "error",
          subType: "js",
          message: "hello",
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
