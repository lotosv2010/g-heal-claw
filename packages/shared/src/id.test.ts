import { describe, expect, it } from "vitest";
import {
  generateId,
  generateProjectId,
  generateUserId,
  ID_PREFIXES,
  PROJECT_ID_PREFIX,
  USER_ID_PREFIX,
} from "./id.js";

describe("generateId", () => {
  it("生成 ID 前缀与入参一致", () => {
    const id = generateId(PROJECT_ID_PREFIX);
    expect(id.startsWith(`${PROJECT_ID_PREFIX}_`)).toBe(true);
  });

  it("生成 ID 长度为 prefix + 1 (下划线) + 10 (nanoid)", () => {
    const id = generateId(USER_ID_PREFIX);
    // "usr" + "_" + 10 = 14
    expect(id).toHaveLength(USER_ID_PREFIX.length + 1 + 10);
  });

  it("nanoid 部分字符集限定为 URL-safe 64 字母表", () => {
    const id = generateId("proj");
    const suffix = id.slice("proj_".length);
    expect(suffix).toMatch(/^[0-9A-Za-z_-]{10}$/);
  });

  it("唯一性：10k 次生成无重复", () => {
    const set = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      set.add(generateId("proj"));
    }
    expect(set.size).toBe(10_000);
  });

  it("空 prefix 抛错", () => {
    expect(() => generateId("")).toThrow(/非空字符串/);
  });

  it("非法 prefix（含大写 / 过长 / 特殊字符）抛错", () => {
    expect(() => generateId("Proj")).toThrow(/小写字母开头/);
    expect(() => generateId("toolongprefix")).toThrow(/小写字母开头/);
    expect(() => generateId("proj-x")).toThrow(/小写字母开头/);
  });

  it("多前缀并存互不污染", () => {
    const projId = generateProjectId();
    const usrId = generateUserId();
    expect(projId.startsWith("proj_")).toBe(true);
    expect(usrId.startsWith("usr_")).toBe(true);
    expect(projId).not.toBe(usrId);
  });

  it("ID_PREFIXES 常量数组包含全部白名单前缀", () => {
    expect(ID_PREFIXES).toContain(PROJECT_ID_PREFIX);
    expect(ID_PREFIXES).toContain(USER_ID_PREFIX);
    expect(ID_PREFIXES.length).toBeGreaterThanOrEqual(7);
  });
});
