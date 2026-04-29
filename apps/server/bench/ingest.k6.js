/* eslint-disable */
// k6 Gateway 压测脚本（T1.3.6）
//
// 生成 custom_log 批量事件，模拟真实 SDK 上报路径：
//   client → DsnAuthGuard → RateLimitGuard → IdempotencyService → Controller
// 批大小默认 50，单 VU 每请求 50 事件；目标 100 VU × ~1req/s ≈ 5000 events/s。
//
// 指标（自定义，排除 429 噪音）：
//   - events_accepted_total / events_duplicates_total / events_429_total
//   - gateway_latency_ms p95/p99
//   - gateway_success_rate（2xx/(2xx+5xx)，不计 429）
//
// 用法见同目录 README.md。

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import {
  uuidv4,
  randomIntBetween,
} from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3001";
const PROJECT_ID = __ENV.PROJECT_ID || "demo";
const PUBLIC_KEY = __ENV.PUBLIC_KEY || "publicKey";
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 50);

const DSN =
  BASE_URL.replace(/^http(s?):\/\//, `http$1://${PUBLIC_KEY}@`) +
  "/" +
  PROJECT_ID;

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "2m", target: 100 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    gateway_latency_ms: ["p(95)<200", "p(99)<500"],
    gateway_success_rate: ["rate>0.99"],
    events_accepted_total: ["count>10000"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

const acceptedEvents = new Counter("events_accepted_total");
const duplicateEvents = new Counter("events_duplicates_total");
const rateLimited = new Counter("events_429_total");
const gatewayLatency = new Trend("gateway_latency_ms");
const successRate = new Rate("gateway_success_rate");

function buildEvent(projectId) {
  const now = Date.now();
  return {
    eventId: uuidv4(),
    projectId,
    publicKey: PUBLIC_KEY,
    timestamp: now,
    type: "custom_log",
    environment: "bench",
    sessionId: `s-${__VU}-${__ITER}`,
    tags: {},
    context: {},
    device: {
      ua: "k6/0.49",
      os: "Linux",
      browser: "k6",
      deviceType: "desktop",
      screen: { width: 1920, height: 1080, dpr: 1 },
      language: "en-US",
      timezone: "UTC",
    },
    page: {
      url: "http://bench/",
      path: "/",
    },
    level: "info",
    message: `bench-${randomIntBetween(1, 1000)}`,
    breadcrumbs: [],
  };
}

function buildBatch(size) {
  const events = [];
  for (let i = 0; i < size; i += 1) events.push(buildEvent(PROJECT_ID));
  return { dsn: DSN, sentAt: Date.now(), events };
}

export default function () {
  const payload = JSON.stringify(buildBatch(BATCH_SIZE));
  const res = http.post(`${BASE_URL}/ingest/v1/events`, payload, {
    headers: {
      "Content-Type": "application/json",
      "X-Ghc-Dsn": DSN,
    },
  });

  if (res.status === 429) {
    rateLimited.add(1);
    // 429 不计入 success_rate，避免限流爬坡噪音污染阈值
  } else if (res.status >= 200 && res.status < 300) {
    const body = safeJson(res.body);
    const accepted = Number(body?.accepted ?? 0);
    const duplicates = Number(body?.duplicates ?? 0);
    acceptedEvents.add(accepted);
    duplicateEvents.add(duplicates);
    gatewayLatency.add(res.timings.duration);
    successRate.add(true);
  } else {
    successRate.add(false);
  }

  check(res, {
    "status is 2xx or 429": (r) =>
      r.status === 429 || (r.status >= 200 && r.status < 300),
  });

  // 单 VU ~1 req/s，配合 ramping-vus 控制整体 QPS
  sleep(1);
}

function safeJson(body) {
  try {
    return JSON.parse(body);
  } catch (_err) {
    return null;
  }
}
