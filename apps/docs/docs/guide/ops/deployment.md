# 生产环境部署

本指南描述 g-heal-claw 平台的生产环境部署流程，涵盖 Docker Compose 单机部署和基本的高可用建议。

## 架构总览

```
                ┌──────────────┐
    用户浏览器 → │  Nginx/CDN   │
                └──────┬───────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌──────────┐
   │ apps/web   │ │  server │ │ ai-agent │
   │ (Next.js)  │ │(NestJS) │ │(BullMQ)  │
   │ :3000      │ │ :3001   │ │ :3002    │
   └────────────┘ └────┬────┘ └─────┬────┘
                       │             │
          ┌────────────┼─────────────┘
          ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌────────┐
   │ PostgreSQL │ │  Redis  │ │ MinIO  │
   │   :5432    │ │  :6379  │ │ :9000  │
   └────────────┘ └─────────┘ └────────┘
```

## 前置条件

| 组件 | 最低版本 | 说明 |
|---|---|---|
| Docker + Compose | 24.x / v2 | 容器运行时 |
| Node.js | 22.x LTS | 构建产物用 |
| 域名 + SSL 证书 | — | HTTPS 必须 |
| 2 核 4GB+ 内存 | — | 最小规格（单机） |

## 1. 构建生产产物

```bash
git clone <repo-url> g-heal-claw && cd g-heal-claw
pnpm install --frozen-lockfile
pnpm build
```

构建顺序由 Turborepo 自动编排：`shared → sdk → server → web → ai-agent`。

## 2. 环境变量配置

复制并编辑生产环境变量：

```bash
cp .env.example .env.production
```

**必填项**：

```bash
# 数据库（建议使用独立 PG 实例或云 RDS）
DATABASE_URL=postgresql://user:password@pg-host:5432/ghealclaw

# Redis（建议 Redis 7+ 独立实例）
REDIS_URL=redis://:password@redis-host:6379

# 应用
NODE_ENV=production
SERVER_PORT=3001
WEB_PORT=3000
AI_AGENT_PORT=3002
PUBLIC_API_BASE_URL=https://api.your-domain.com
PUBLIC_WEB_BASE_URL=https://app.your-domain.com

# JWT（务必使用强随机密钥）
JWT_SECRET=<openssl rand -base64 64>
REFRESH_TOKEN_SECRET=<openssl rand -base64 64>

# 对象存储（S3 兼容 / MinIO）
MINIO_ENDPOINT=https://s3.your-domain.com
MINIO_ACCESS_KEY=<access-key>
MINIO_SECRET_KEY=<secret-key>
MINIO_BUCKET_SOURCEMAPS=sourcemaps

# AI Agent（可选）
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<your-key>

# GeoIP（MaxMind GeoLite2-City.mmdb 路径）
GEOIP_DB_PATH=/data/GeoLite2-City.mmdb
```

完整字段说明见 `.env.example` 注释和 `packages/shared/src/env/` Schema 定义。

## 3. Docker Compose 部署（单机）

### 3.1 docker-compose.production.yml

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ghealclaw
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ghealclaw
    volumes:
      - pg_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ghealclaw"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      retries: 5

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "127.0.0.1:3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/healthz"]
      interval: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - server

  ai-agent:
    build:
      context: .
      dockerfile: apps/ai-agent/Dockerfile
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      redis:
        condition: service_healthy

volumes:
  pg_data:
  redis_data:
```

### 3.2 启动

```bash
docker compose -f docker-compose.production.yml up -d
```

## 4. 数据库迁移

首次部署或升级版本后执行：

```bash
# 方式 A：通过 server 容器内执行
docker compose exec server node dist/migrate.js

# 方式 B：server 启动时自动执行（默认行为）
# DatabaseService.onModuleInit 会幂等执行 ALL_DDL
# 包含 CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
```

生产环境建议在部署流水线中显式执行迁移，避免启动时 DDL 执行超时：

```bash
# CI/CD 流水线步骤
pnpm -F @g-heal-claw/server db:migrate
```

## 5. Nginx 反向代理

```nginx
upstream server_backend {
    server 127.0.0.1:3001;
}

upstream web_frontend {
    server 127.0.0.1:3000;
}

# API 服务
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    # SDK 上报入口（高频、小包体）
    location /ingest/ {
        proxy_pass http://server_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # sendBeacon 的 Content-Type: text/plain 需要放行
        proxy_set_header Content-Type $content_type;

        # 限制请求体大小（SDK 单次上报 ≤ 64KB）
        client_max_body_size 128k;
    }

    # Dashboard API + Sourcemap 上传
    location / {
        proxy_pass http://server_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Sourcemap 上传允许较大文件
        client_max_body_size 50m;
    }

    # SSE 实时推送
    location /api/v1/stream/ {
        proxy_pass http://server_backend;
        proxy_set_header Connection "";
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}

# Web 前端
server {
    listen 443 ssl http2;
    server_name app.your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location / {
        proxy_pass http://web_frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**重要**：`X-Real-IP` / `X-Forwarded-For` 头必须正确设置，GeoIP 地域解析依赖真实客户端 IP。Server 启动时已配置 `trustProxy: true`。

## 6. 健康检查

| 端点 | 用途 | 预期响应 |
|---|---|---|
| `GET /healthz` | 存活探针 | `{ "status": "ok" }` |
| `GET /api/docs` | Swagger 文档（非生产） | 仅 `NODE_ENV !== production` |

容器编排（K8s / ECS）中建议配置 liveness + readiness probe 指向 `/healthz`。

## 7. 日志与监控

- **应用日志**：Pino JSON 格式输出到 stdout，由 Docker 日志驱动收集
- **日志级别**：通过 `LOG_LEVEL` 环境变量控制（默认 `info`，调试时设为 `debug`）
- **Prometheus 指标**：`PROMETHEUS_ENABLED=true` 后 `/metrics` 端点暴露（Phase 6 规划）
- **告警**：内置告警引擎（Phase 4）支持 email / 钉钉 / 企微 / Slack / Webhook 5 种通知渠道

## 8. 备份与恢复

### PostgreSQL

```bash
# 备份
pg_dump -U ghealclaw -Fc ghealclaw > backup_$(date +%Y%m%d).dump

# 恢复
pg_restore -U ghealclaw -d ghealclaw backup_20260507.dump
```

### Redis

Redis 主要存储队列任务和缓存，非持久化关键数据。建议开启 RDB 快照（默认配置即可）。

## 9. 升级流程

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 构建
pnpm install --frozen-lockfile && pnpm build

# 3. 数据库迁移
pnpm -F @g-heal-claw/server db:migrate

# 4. 重启服务（零停机可用滚动更新）
docker compose -f docker-compose.production.yml up -d --build
```

## 10. 常见问题

| 问题 | 解决方案 |
|---|---|
| Server 启动报 env 校验失败 | 检查 `.env.production` 所有必填字段，参照 `.env.example` |
| SDK 上报 CORS 错误 | Nginx 需放行 `Origin: <your-frontend-domain>`；或在 server `PUBLIC_WEB_BASE_URL` 中配置 |
| GeoIP 地域为空 | 确认 `GEOIP_DB_PATH` 指向有效的 `.mmdb` 文件；生产环境需下载 MaxMind GeoLite2-City |
| BullMQ 队列堆积 | 检查 Redis 连接 + Worker 进程存活；调整 `PERF_PROCESSOR_CONCURRENCY` |
| Sourcemap 上传失败 | 检查 MinIO/S3 连接 + bucket 权限；Nginx `client_max_body_size` ≥ 50m |
