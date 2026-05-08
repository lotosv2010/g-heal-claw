import { describe, it, expect } from "vitest";
import { validateTrackName, TrackNameSchema, TRACK_NAME_MAX_LENGTH } from "../../src/validation/track-name.js";

describe("validateTrackName", () => {
  it("合法的 domain_action 格式通过", () => {
    expect(validateTrackName("checkout_submit")).toEqual([]);
    expect(validateTrackName("login_success")).toEqual([]);
    expect(validateTrackName("video_play_start")).toEqual([]);
    expect(validateTrackName("page_view_home")).toEqual([]);
  });

  it("空字符串返回 error", () => {
    const issues = validateTrackName("");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("empty");
    expect(issues[0]!.severity).toBe("error");
  });

  it("纯空格返回 error", () => {
    const issues = validateTrackName("   ");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("empty");
  });

  it("超过 128 字符返回 error", () => {
    const longName = "a".repeat(TRACK_NAME_MAX_LENGTH + 1);
    const issues = validateTrackName(longName);
    expect(issues.some((i) => i.rule === "too_long")).toBe(true);
  });

  it("恰好 128 字符的单词通过（warn: no_separator）", () => {
    const name = "a".repeat(TRACK_NAME_MAX_LENGTH);
    const issues = validateTrackName(name);
    expect(issues.every((i) => i.severity === "warn")).toBe(true);
  });

  it("包含大写字母返回 invalid_chars error", () => {
    const issues = validateTrackName("Checkout_Submit");
    expect(issues.some((i) => i.rule === "invalid_chars")).toBe(true);
  });

  it("包含连字符返回 invalid_chars error", () => {
    const issues = validateTrackName("checkout-submit");
    expect(issues.some((i) => i.rule === "invalid_chars")).toBe(true);
  });

  it("包含空格返回 invalid_chars error", () => {
    const issues = validateTrackName("checkout submit");
    expect(issues.some((i) => i.rule === "invalid_chars")).toBe(true);
  });

  it("以数字开头返回 invalid_chars error", () => {
    const issues = validateTrackName("1checkout_submit");
    expect(issues.some((i) => i.rule === "invalid_chars")).toBe(true);
  });

  it("以下划线开头返回 error", () => {
    const issues = validateTrackName("_checkout_submit");
    expect(issues.some((i) => i.rule === "starts_with_underscore")).toBe(true);
  });

  it("连续下划线返回 error", () => {
    const issues = validateTrackName("checkout__submit");
    expect(issues.some((i) => i.rule === "consecutive_underscores")).toBe(true);
  });

  it("以下划线结尾返回 error", () => {
    const issues = validateTrackName("checkout_submit_");
    expect(issues.some((i) => i.rule === "ends_with_underscore")).toBe(true);
  });

  it("无下划线分隔返回 warn（no_separator）", () => {
    const issues = validateTrackName("checkout");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.rule).toBe("no_separator");
    expect(issues[0]!.severity).toBe("warn");
  });

  it("数字在中间合法", () => {
    expect(validateTrackName("page2_view")).toEqual([]);
    expect(validateTrackName("h5_login_v2")).toEqual([]);
  });

  it("多个下划线分隔合法", () => {
    expect(validateTrackName("user_profile_edit_save")).toEqual([]);
  });
});

describe("TrackNameSchema (Zod)", () => {
  it("合法值 parse 通过", () => {
    expect(TrackNameSchema.parse("checkout_submit")).toBe("checkout_submit");
  });

  it("空字符串 parse 抛错", () => {
    expect(() => TrackNameSchema.parse("")).toThrow();
  });

  it("超长字符串 parse 抛错", () => {
    expect(() => TrackNameSchema.parse("a".repeat(129))).toThrow();
  });

  it("包含大写 parse 抛错", () => {
    expect(() => TrackNameSchema.parse("Checkout")).toThrow();
  });

  it("连续下划线 parse 抛错", () => {
    expect(() => TrackNameSchema.parse("a__b")).toThrow();
  });

  it("以下划线结尾 parse 抛错", () => {
    expect(() => TrackNameSchema.parse("a_b_")).toThrow();
  });
});
