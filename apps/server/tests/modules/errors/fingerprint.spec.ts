import { describe, expect, it } from "vitest";
import type { ErrorEvent, StackFrame } from "@g-heal-claw/shared";
import {
  buildIssueTitle,
  computeFingerprint,
  normalizeMessage,
} from "../../../src/modules/errors/fingerprint.js";
import { buildErrorEvent } from "../../fixtures.js";

/**
 * 指纹计算单测（T1.4.1 / ADR-0016 §3）
 *
 * 覆盖：
 *  - normalizeMessage：UUID / 十六进制 / 长数字 / URL / 空白压缩
 *  - computeFingerprint：确定性输出、同组事件指纹一致、subType 影响指纹
 *  - topFrame 影响指纹（函数名 / 文件名 basename）
 *  - buildIssueTitle：截断 200 + 空 message 降级到 subType
 */

function withFrames(frames: readonly StackFrame[]): Partial<ErrorEvent> {
  return { frames: frames as StackFrame[] };
}

describe("normalizeMessage", () => {
  it("抹掉 UUID", () => {
    const msg = normalizeMessage(
      "Cannot read 11111111-2222-4333-8444-555555555555 of undefined",
    );
    expect(msg).toBe("Cannot read {uuid} of undefined");
  });

  it("抹掉 0x 地址", () => {
    expect(normalizeMessage("Bad pointer 0xdeadbeef at line 0x1234")).toBe(
      "Bad pointer {hex} at line {hex}",
    );
  });

  it("抹掉长数字（timestamp / id）", () => {
    expect(normalizeMessage("order 1700000000 failed code 404")).toBe(
      "order {num} failed code 404",
    );
  });

  it("URL 仅保留 origin + path（query 剔除）", () => {
    expect(
      normalizeMessage(
        "Fetch https://api.example.com/v1/users?token=abc&id=1 failed",
      ),
    ).toBe("Fetch https://api.example.com/v1/users failed");
  });

  it("压缩多余空白并截断 512", () => {
    const long = "a".repeat(1000);
    expect(normalizeMessage(`x   y\n\tz`)).toBe("x y z");
    expect(normalizeMessage(long).length).toBe(512);
  });
});

describe("computeFingerprint", () => {
  it("确定性：相同输入 → 相同输出", () => {
    const ev = buildErrorEvent({ message: "Boom" });
    expect(computeFingerprint(ev)).toBe(computeFingerprint(ev));
  });

  it("subType 改变 → 指纹改变", () => {
    const a = buildErrorEvent({ message: "Boom", subType: "js" });
    const b = buildErrorEvent({ message: "Boom", subType: "promise" });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("归一化等价的 message → 指纹一致（UUID 抹除）", () => {
    const a = buildErrorEvent({
      message:
        "Read 11111111-2222-4333-8444-555555555555 failed",
    });
    const b = buildErrorEvent({
      message:
        "Read 22222222-3333-4444-8555-666666666666 failed",
    });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("topFrame.file basename + function 影响指纹", () => {
    const base = buildErrorEvent({ message: "Boom" });
    const withFrame = buildErrorEvent({
      message: "Boom",
      ...withFrames([{ file: "/a/b/c.js", function: "doThing" }]),
    });
    expect(computeFingerprint(base)).not.toBe(computeFingerprint(withFrame));
  });

  it("不同目录但同 basename + 同 function → 指纹一致", () => {
    const a = buildErrorEvent({
      message: "Boom",
      ...withFrames([{ file: "/a/b/c.js", function: "f" }]),
    });
    const b = buildErrorEvent({
      message: "Boom",
      ...withFrames([{ file: "/x/y/c.js", function: "f" }]),
    });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it("返回 40 字符 sha1 hex", () => {
    const fp = computeFingerprint(buildErrorEvent());
    expect(fp).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("buildIssueTitle", () => {
  it("截断 200 字符", () => {
    const long = "x".repeat(500);
    expect(buildIssueTitle(buildErrorEvent({ message: long })).length).toBe(200);
  });

  it("空 message 降级到 subType", () => {
    expect(buildIssueTitle(buildErrorEvent({ message: "" }))).toBe("js");
  });
});
