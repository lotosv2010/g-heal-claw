import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseEnv, EnvValidationError } from "./parse.js";
import { BaseEnvSchema } from "./base.js";
import { ServerEnvSchema } from "./server.js";
import { AiAgentEnvSchema } from "./ai-agent.js";

// 最小化 Base fixture，其他 Schema 组合时复用
const baseRaw: Record<string, string> = {
  POSTGRES_USER: "ghc",
  POSTGRES_PASSWORD: "ghc",
  POSTGRES_DB: "ghc",
  DATABASE_URL: "postgresql://ghc:ghc@localhost:5432/ghc",
  REDIS_URL: "redis://localhost:6379",
  MINIO_ROOT_USER: "root",
  MINIO_ROOT_PASSWORD: "root",
  MINIO_ENDPOINT: "http://localhost:9000",
  MINIO_ACCESS_KEY: "key",
  MINIO_SECRET_KEY: "secret",
  MINIO_BUCKET_SOURCEMAPS: "sm",
  MINIO_BUCKET_EVENTS: "events",
  MINIO_BUCKET_HEAL: "heal",
  PUBLIC_API_BASE_URL: "http://localhost:3001",
  PUBLIC_WEB_BASE_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("成功：返回类型收窄结果", () => {
    const schema = z.object({ FOO: z.string() });
    const out = parseEnv(schema, { FOO: "bar" });
    expect(out.FOO).toBe("bar");
  });

  it("失败：抛出 EnvValidationError 并附带 issues", () => {
    const schema = z.object({ FOO: z.string() });
    expect(() => parseEnv(schema, {})).toThrow(EnvValidationError);
    try {
      parseEnv(schema, {});
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).issues.length).toBeGreaterThan(0);
      expect((err as Error).message).toContain("FOO");
    }
  });
});

describe("BaseEnvSchema", () => {
  it("happy path：所有字段提供后通过", () => {
    const out = parseEnv(BaseEnvSchema, baseRaw);
    expect(out.DATABASE_URL).toContain("postgresql://");
    expect(out.PROMETHEUS_ENABLED).toBe(true); // 默认值生效
    expect(out.NODE_ENV).toBe("development");
  });

  it("失败：DATABASE_URL 非法 URL", () => {
    expect(() =>
      parseEnv(BaseEnvSchema, { ...baseRaw, DATABASE_URL: "not-a-url" }),
    ).toThrow(EnvValidationError);
  });

  it("端口字符串可转数字", () => {
    const out = parseEnv(BaseEnvSchema, { ...baseRaw, SERVER_PORT: "4001" });
    expect(out.SERVER_PORT).toBe(4001);
  });

  it("PROMETHEUS_ENABLED 支持 0/1/true/false 解析", () => {
    expect(parseEnv(BaseEnvSchema, { ...baseRaw, PROMETHEUS_ENABLED: "0" }).PROMETHEUS_ENABLED).toBe(false);
    expect(parseEnv(BaseEnvSchema, { ...baseRaw, PROMETHEUS_ENABLED: "false" }).PROMETHEUS_ENABLED).toBe(false);
    expect(parseEnv(BaseEnvSchema, { ...baseRaw, PROMETHEUS_ENABLED: "true" }).PROMETHEUS_ENABLED).toBe(true);
  });
});

describe("ServerEnvSchema", () => {
  const serverRaw: Record<string, string> = {
    ...baseRaw,
    JWT_SECRET: "a".repeat(32),
    REFRESH_TOKEN_SECRET: "b".repeat(32),
    SMTP_HOST: "localhost",
    SMTP_FROM: "alerts@ghc.local",
    GEOIP_DB_PATH: "./data/geo.mmdb",
  };

  it("happy path：默认值补齐", () => {
    const out = parseEnv(ServerEnvSchema, serverRaw);
    expect(out.JWT_EXPIRES_IN).toBe("1h");
    expect(out.GATEWAY_RATE_LIMIT_PER_SEC).toBe(100);
    expect(out.SERVER_DEFAULT_SAMPLE_RATE).toBe(1);
    expect(out.SMS_PROVIDER).toBe("none");
  });

  it("失败：JWT_SECRET 太短", () => {
    expect(() =>
      parseEnv(ServerEnvSchema, { ...serverRaw, JWT_SECRET: "short" }),
    ).toThrow(EnvValidationError);
  });

  it("失败：SMTP_FROM 非法邮箱", () => {
    expect(() =>
      parseEnv(ServerEnvSchema, { ...serverRaw, SMTP_FROM: "not-an-email" }),
    ).toThrow(EnvValidationError);
  });

  it("失败：JWT_EXPIRES_IN 非法格式", () => {
    expect(() =>
      parseEnv(ServerEnvSchema, { ...serverRaw, JWT_EXPIRES_IN: "abc" }),
    ).toThrow(EnvValidationError);
  });
});

describe("AiAgentEnvSchema", () => {
  const aiRaw: Record<string, string> = {
    ...baseRaw,
    ANTHROPIC_API_KEY: "sk-ant-xxx",
  };

  it("happy path：至少一个 AI key 提供后通过", () => {
    const out = parseEnv(AiAgentEnvSchema, aiRaw);
    expect(out.ANTHROPIC_MODEL).toBe("claude-opus-4-7");
    expect(out.AI_MAX_STEPS).toBe(20);
    expect(out.HEAL_SANDBOX_IMAGE).toBe("node:20-alpine");
  });

  it("失败：两家 AI key 都缺失", () => {
    expect(() =>
      parseEnv(AiAgentEnvSchema, {
        ...baseRaw,
      }),
    ).toThrow(EnvValidationError);
  });

  it("OPENAI 单独提供亦可通过", () => {
    const out = parseEnv(AiAgentEnvSchema, {
      ...baseRaw,
      OPENAI_API_KEY: "sk-xxx",
    });
    expect(out.OPENAI_API_KEY).toBe("sk-xxx");
  });
});
