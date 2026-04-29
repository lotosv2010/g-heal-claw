import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import supertest from "supertest";
import { AppModule } from "../src/app.module.js";
import type { ServerEnv } from "../src/config/env.js";
import { buildCustomLogEvent } from "./fixtures.js";

// e2e 固定 env，不触碰 process.env；避免本地 .env 影响
const fixtureEnv: ServerEnv = {
  POSTGRES_USER: "x",
  POSTGRES_PASSWORD: "x",
  POSTGRES_DB: "x",
  DATABASE_URL: "postgresql://x:x@localhost:5432/x",
  REDIS_URL: "redis://localhost:6379",
  MINIO_ROOT_USER: "x",
  MINIO_ROOT_PASSWORD: "x",
  MINIO_ENDPOINT: "http://localhost:9000",
  MINIO_REGION: "us-east-1",
  MINIO_ACCESS_KEY: "x",
  MINIO_SECRET_KEY: "x",
  MINIO_BUCKET_SOURCEMAPS: "sourcemaps",
  MINIO_BUCKET_EVENTS: "events",
  MINIO_BUCKET_HEAL: "heal",
  NODE_ENV: "test",
  SERVER_PORT: 3001,
  WEB_PORT: 3000,
  AI_AGENT_PORT: 3002,
  PUBLIC_API_BASE_URL: "http://localhost:3001",
  PUBLIC_WEB_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "error",
  OTEL_EXPORTER_OTLP_ENDPOINT: "",
  OTEL_SERVICE_NAME: "g-heal-claw",
  PROMETHEUS_ENABLED: true,
  JWT_SECRET: "0123456789012345678901234567890123",
  JWT_EXPIRES_IN: "1h",
  REFRESH_TOKEN_SECRET: "0123456789012345678901234567890123",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  GATEWAY_RATE_LIMIT_PER_SEC: 100,
  GATEWAY_RATE_LIMIT_BURST: 200,
  SERVER_DEFAULT_SAMPLE_RATE: 1,
  ISSUE_HLL_BACKFILL_INTERVAL_MS: 0,
  ISSUE_HLL_BACKFILL_BATCH: 500,
  SMTP_HOST: "localhost",
  SMTP_PORT: 1025,
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "alerts@ghealclaw.local",
  SMTP_SECURE: false,
  GEOIP_DB_PATH: "./geoip.mmdb",
  DINGTALK_DEFAULT_WEBHOOK: "",
  WECHAT_WORK_DEFAULT_WEBHOOK: "",
  SLACK_DEFAULT_WEBHOOK: "",
  SMS_PROVIDER: "none",
  SMS_ACCESS_KEY: "",
  SMS_ACCESS_SECRET: "",
  SMS_SIGN_NAME: "",
};

describe("Gateway e2e", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule.forRoot(fixtureEnv)],
    }).compile();

    app = mod.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    app.enableCors({
      origin: [fixtureEnv.PUBLIC_WEB_BASE_URL, "http://localhost:3100"],
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const VALID_DSN = "http://pk_demo@localhost:3001/demo";

  it("POST /ingest/v1/events — 合法 payload 返回 accepted 计数", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/ingest/v1/events")
      .send({
        dsn: VALID_DSN,
        sentAt: Date.now(),
        events: [buildCustomLogEvent()],
      })
      .expect(200);
    // NODE_ENV=test 下 DatabaseService / RedisService 均不建连接
    // Redis 缺席时幂等放行，persisted 仍为 0（DB 未建连）；duplicates 恒为 0
    expect(res.body).toEqual({ accepted: 1, persisted: 0, duplicates: 0 });
  });

  it("POST /ingest/v1/events — 非法 payload（events 空）返回 400", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/ingest/v1/events")
      .send({ dsn: VALID_DSN, sentAt: Date.now(), events: [] })
      .expect(400);
    expect(res.body).toMatchObject({ error: "VALIDATION_FAILED" });
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("POST /ingest/v1/events — 缺 DSN → 401 INVALID_DSN", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/ingest/v1/events")
      .send({ sentAt: Date.now(), events: [buildCustomLogEvent()] })
      .expect(401);
    expect(res.body).toMatchObject({ error: "INVALID_DSN" });
  });

  it("POST /ingest/v1/events — 非法 DSN 字符串 → 401 INVALID_DSN", async () => {
    const res = await supertest(app.getHttpServer())
      .post("/ingest/v1/events")
      .send({
        dsn: "not-a-url",
        sentAt: Date.now(),
        events: [buildCustomLogEvent()],
      })
      .expect(401);
    expect(res.body).toMatchObject({ error: "INVALID_DSN" });
  });

  it("CORS preflight — localhost:3100 放行", async () => {
    const res = await supertest(app.getHttpServer())
      .options("/ingest/v1/events")
      .set("Origin", "http://localhost:3100")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3100",
    );
  });

  it("GET /healthz → { status: ok }", async () => {
    const res = await supertest(app.getHttpServer()).get("/healthz").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
