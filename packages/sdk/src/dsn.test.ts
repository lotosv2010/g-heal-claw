import { describe, it, expect } from "vitest";
import { parseDsn } from "./dsn.js";

describe("parseDsn", () => {
  it("标准 http DSN", () => {
    const r = parseDsn("http://pk_abc@localhost:3001/proj_demo");
    expect(r).not.toBeNull();
    expect(r!.publicKey).toBe("pk_abc");
    expect(r!.host).toBe("localhost");
    expect(r!.port).toBe("3001");
    expect(r!.projectId).toBe("proj_demo");
    expect(r!.ingestUrl).toBe("http://localhost:3001/ingest/v1/events");
  });

  it("https 无端口", () => {
    const r = parseDsn("https://pk_xyz@ghc.example.com/p1");
    expect(r!.ingestUrl).toBe("https://ghc.example.com/ingest/v1/events");
    expect(r!.port).toBeUndefined();
  });

  it.each([
    ["空字符串", ""],
    ["无 publicKey", "http://localhost:3001/proj_demo"],
    ["无 projectId", "http://pk@localhost:3001/"],
    ["projectId 嵌套路径", "http://pk@localhost:3001/a/b"],
    ["非 http(s) 协议", "ftp://pk@localhost/p"],
    ["非法 URL", "not-a-url"],
  ])("失败：%s 返回 null", (_name, input) => {
    expect(parseDsn(input)).toBeNull();
  });
});
