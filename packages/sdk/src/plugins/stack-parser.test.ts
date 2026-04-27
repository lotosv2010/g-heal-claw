import { describe, expect, it } from "vitest";
import { parseStack } from "./stack-parser.js";

describe("parseStack", () => {
  it("空/非法输入返回空数组", () => {
    expect(parseStack(undefined)).toEqual([]);
    expect(parseStack("")).toEqual([]);
    // @ts-expect-error 运行时防御
    expect(parseStack(123)).toEqual([]);
  });

  it("V8 带函数名", () => {
    const stack = [
      "TypeError: x is undefined",
      "    at readUser (https://a.com/app.js:42:13)",
      "    at main (https://a.com/app.js:10:5)",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      file: "https://a.com/app.js",
      function: "readUser",
      line: 42,
      column: 13,
    });
    expect(frames[1]?.function).toBe("main");
  });

  it("V8 匿名顶层（无函数名）", () => {
    const stack = [
      "Error: boom",
      "    at https://a.com/app.js:1:100",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      file: "https://a.com/app.js",
      line: 1,
      column: 100,
    });
    expect(frames[0]?.function).toBeUndefined();
  });

  it("剥离 async / new 前缀", () => {
    const stack = [
      "Error",
      "    at async fetchUser (https://a.com/app.js:3:1)",
      "    at new Foo (https://a.com/app.js:4:1)",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames[0]?.function).toBe("fetchUser");
    expect(frames[1]?.function).toBe("Foo");
  });

  it("Firefox / Safari `fn@file:line:col`", () => {
    const stack = [
      "readUser@https://a.com/app.js:42:13",
      "main@https://a.com/app.js:10:5",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      file: "https://a.com/app.js",
      function: "readUser",
      line: 42,
      column: 13,
    });
  });

  it("Firefox 匿名帧 `@file:line:col`", () => {
    const frames = parseStack("@https://a.com/app.js:1:100");
    expect(frames).toHaveLength(1);
    expect(frames[0]?.function).toBeUndefined();
    expect(frames[0]?.file).toBe("https://a.com/app.js");
  });

  it("eval 帧取外层 file/line/col", () => {
    const stack = [
      "Error",
      "    at eval (eval at runCode (https://a.com/app.js:5:3), <anonymous>:1:1)",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(1);
    // 外层包裹的整串会进入 file 字段（eval 内层恢复不是 MVP 目标）
    expect(frames[0]?.function).toBe("eval");
  });

  it("≤ 20 帧上限", () => {
    const body = Array.from(
      { length: 50 },
      (_, i) => `    at fn${i} (https://a.com/app.js:${i + 1}:1)`,
    ).join("\n");
    const frames = parseStack("Error\n" + body);
    expect(frames).toHaveLength(20);
    expect(frames[0]?.function).toBe("fn0");
    expect(frames[19]?.function).toBe("fn19");
  });

  it("无法识别行被跳过，不影响其他帧", () => {
    const stack = [
      "Error",
      "garbage line without markers",
      "    at fn (https://a.com/app.js:1:1)",
      "more garbage",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.function).toBe("fn");
  });
});
