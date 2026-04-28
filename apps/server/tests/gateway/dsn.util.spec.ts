import { describe, expect, it } from "vitest";
import { parseDsn } from "../../src/gateway/dsn.util.js";

/**
 * 服务端 DSN 解析单测（T1.3.2）
 *
 * 与 SDK 侧 parseDsn 保持行为一致：合法返回结构体，非法返回 null。
 * 场景覆盖：空串 / 非 URL / 协议非 http(s) / 缺 publicKey / 缺 projectId / 嵌套路径。
 */
describe("parseDsn", () => {
  it("合法 http DSN", () => {
    const r = parseDsn("http://pk_abc@localhost:3001/proj_demo");
    expect(r).toEqual({
      protocol: "http",
      publicKey: "pk_abc",
      host: "localhost",
      port: "3001",
      projectId: "proj_demo",
    });
  });

  it("合法 https DSN（无端口）", () => {
    const r = parseDsn("https://pk_xyz@ghc.example.com/proj_prod");
    expect(r).toEqual({
      protocol: "https",
      publicKey: "pk_xyz",
      host: "ghc.example.com",
      port: undefined,
      projectId: "proj_prod",
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["空串", ""],
    ["非 URL", "not a url"],
    ["ftp 协议", "ftp://pk@host/proj"],
    ["缺 publicKey", "http://@localhost/proj"],
    ["缺 projectId", "http://pk@localhost/"],
    ["嵌套路径", "http://pk@localhost/proj/extra"],
  ])("非法输入 → null (%s)", (_label, input) => {
    expect(parseDsn(input as string | null | undefined)).toBeNull();
  });
});
