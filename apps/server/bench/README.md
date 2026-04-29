# Gateway 压测脚本（T1.3.6）

目标：验证 `POST /ingest/v1/events` 在项目级限流 + DSN 鉴权 + 幂等 + DLQ 全链路开启下的吞吐基线。

## 前置

1. server 已启动（`pnpm -F @g-heal-claw/server dev` 或 `start:prod`）
2. Postgres / Redis 已起（`docker compose up -d postgres redis`）
3. dev-seed 已注入 demo project（首次启动自动）
4. 安装 [k6](https://k6.io/docs/get-started/installation/)

## 快速跑（本机冒烟，~30s）

```bash
k6 run apps/server/bench/ingest.k6.js \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e PROJECT_ID=demo \
  -e PUBLIC_KEY=publicKey
```

## 标准压测（5000 events/s 目标，5 分钟）

```bash
k6 run apps/server/bench/ingest.k6.js \
  -e BASE_URL=http://127.0.0.1:3001 \
  -e PROJECT_ID=demo \
  -e PUBLIC_KEY=publicKey \
  -e BATCH_SIZE=50 \
  --stage 30s:0,2m:50,2m:100,30s:0
```

- `--stage` 每阶段 VU 数量；单 VU `batchSize=50 events/req`，100 VU × ~1 req/s ≈ 5000 events/s
- 限流 burst=200 / rate=100/s，启动阶段会触发部分 429（观察 `rate_limited` 计数）

## 阈值

脚本内置 `thresholds`：
- `http_req_duration{accepted:true}`: p95 < 200ms
- `http_req_failed{accepted:true}`: rate < 0.01（排除 429）
- `events_accepted_total`: count > 10000（5min 场景）

输出：
```text
events_accepted_total   100000
events_duplicates_total      0
events_429_total           312   (限流爬坡阶段)
```

## 产物留存

每次基线测试把 k6 summary 导出并归档到 `docs/bench/`：

```bash
k6 run ... --summary-export=docs/bench/2026-04-29-ingest.json
```

仓库暂不提交 summary 文件；首次跑完由开发者把数字 + 硬件环境粘到 `docs/tasks/CURRENT.md` T1.3.6 条目。
