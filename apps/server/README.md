# @g-heal-claw/server

NestJS 10 + Fastify adapter 实现的 g-heal-claw 后端（模块化单体，ADR-0001 / ADR-0011）。

## 当前能力（T1.1.3 骨架阶段）

- `POST /ingest/v1/events` — Gateway 入口，Zod 校验 + 日志记录（**不入队、不落库**）
- `GET /healthz` — Liveness 检查
- `GET /docs` — Swagger UI（开发模式）

## 启动

```bash
# 根目录先配置 .env
cp .env.example .env

# 启动（默认 SERVER_PORT=3001）
pnpm -F @g-heal-claw/server dev
```

## 非目标（留给后续任务）

| 能力 | 任务 |
|---|---|
| BullMQ 队列入队 | T1.3.2 |
| DSN publicKey 鉴权 + Rate Limit | T1.3.1 |
| Drizzle Schema + 数据落库 | T1.1.5 |
| Sourcemap 还原 / Issue 聚合 | T1.3.3 / T1.3.4 |
| Notification / Alerting / AI Agent | Phase 4~5 |
