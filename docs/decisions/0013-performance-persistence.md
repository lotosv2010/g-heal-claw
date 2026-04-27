# ADR-0013: 性能数据持久化切片（PostgreSQL + Drizzle）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

T1.1.3（server 骨架）已打通"SDK → Gateway → 200 响应"链路，但目前只打日志，事件随进程生命周期丢失。为让"页面性能（`/performance` 大盘）"从 mock 升级到真实数据源，需要把 SDK 上报的 **performance / long_task** 两类事件落库。

本 ADR 定义 T1.1.5 的**性能切片先行版**，完整 Schema（projects / project_keys / issues / events_raw 分区等）在 T1.1.5 剩余部分推进。约束：

- ARCHITECTURE §2 已锁定 ORM = Drizzle（ADR-0003），驱动 = postgres.js（轻量 + 类型友好）
- 架构红线：所有 DB 访问通过 `SharedModule` 提供的 Drizzle 实例
- 骨架阶段不接 BullMQ（保留到 T1.3.2），Gateway 内部直调 PerformanceService
- 开发数据库由用户本地 PostgreSQL 提供（非 docker-compose 实例）

## 决策

**1. 数据库连接**

- 驱动：`postgres@^3.4`（postgres.js，单连接池，轻量、tree-shakeable）
- ORM：`drizzle-orm@^0.36`（查询 + 类型）；不引入 `drizzle-kit` CLI，首版 DDL 采用**内置 `CREATE TABLE IF NOT EXISTS`**，T1.1.5 完整迁移体系再替换为 drizzle-kit
- 连接参数：`env.DATABASE_URL`，`max=10`，`idle_timeout=20s`
- 启动时 `onModuleInit` 执行 DDL（幂等）；`NODE_ENV=test` 跳过连接与 DDL，避免 e2e 依赖真实 DB

**2. 表结构（单表合并性能 + 长任务，最简可用）**

```sql
CREATE TABLE IF NOT EXISTS perf_events_raw (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL UNIQUE,           -- 幂等：ON CONFLICT DO NOTHING
  project_id      varchar(64) NOT NULL,
  public_key      varchar(64) NOT NULL,
  session_id      varchar(64) NOT NULL,
  ts_ms           bigint NOT NULL,                -- SDK 端事件时间戳 (ms)
  type            varchar(16) NOT NULL,           -- performance | long_task
  metric          varchar(16),                    -- LCP | FCP | CLS | INP | TTFB | FSP
  value           double precision,
  rating          varchar(24),                    -- good | needs-improvement | poor
  lt_duration_ms  double precision,               -- long_task.duration
  lt_start_ms     double precision,               -- long_task.startTime
  navigation      jsonb,                          -- NavigationTiming 整包
  url             text NOT NULL,
  path            text NOT NULL,
  ua              text,
  browser         varchar(64),
  os              varchar(64),
  device_type     varchar(16),
  release         varchar(64),
  environment     varchar(32),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_project_ts
  ON perf_events_raw (project_id, ts_ms DESC);

CREATE INDEX IF NOT EXISTS idx_perf_project_metric_ts
  ON perf_events_raw (project_id, metric, ts_ms DESC)
  WHERE metric IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_perf_project_path_ts
  ON perf_events_raw (project_id, path, ts_ms DESC);
```

**3. 模块边界**

```
apps/server/src/shared/database/
├── database.module.ts      # @Global，暴露 DB token
├── database.service.ts     # onModuleInit: 建连接 → applyDdl() → ready=true
├── schema.ts               # Drizzle table 定义（perfEventsRaw）
└── ddl.ts                  # 原始 CREATE TABLE / INDEX 语句常量

apps/server/src/performance/
├── performance.module.ts
└── performance.service.ts  # save(PerformanceEvent | LongTaskEvent)：INSERT ON CONFLICT DO NOTHING
```

- GatewayService 在 `ingest()` 中按 `event.type` 路由：`performance` / `long_task` → `PerformanceService.save(event)`（同步 await 批量 Promise.allSettled，失败不拖累 HTTP 响应）
- 其他类型保持现有"仅日志"，等 T1.3.2 再接 BullMQ

**4. 环境变量与本地开发数据库**

用户本地 PostgreSQL：`127.0.0.1:5432`，用户 `postgres` / `root123456`，数据库名 `g-heal-claw`。

- `.env` / `.env.example` **不修改**（保持 docker-compose 默认 `ghealclaw`）
- 在仓库根新增 **`.env.local`**（已在 `.gitignore`，不入库）覆盖连接串
- `dotenv-flow` 优先级 `.env.local > .env.<NODE_ENV> > .env`，天然生效
- 数据库需**用户预先手工创建**：`createdb -U postgres "g-heal-claw"` 或 `psql -U postgres -c 'CREATE DATABASE "g-heal-claw"'`

## 备选方案

**备选 A：Prisma。**放弃：ADR-0003 已拒绝。

**备选 B：启动时自动 `CREATE DATABASE` if not exists。**放弃：需要 server 常驻 `postgres` 超级权限，生产环境是反模式；本地一次性手工创建成本极低。

**备选 C：直接启用 drizzle-kit 完整迁移。**放弃：需额外 CLI、迁移元数据文件、Turbo 脚本；本次切片只需 1 张表 3 个索引，先走 `CREATE IF NOT EXISTS` DDL；T1.1.5 再用 drizzle-kit 接管全套迁移。

**备选 D：在 Gateway 里直接连 DB。**放弃：违反"模块间通过 Service 注入"规则；也破坏 T1.3.2 把 Gateway 改为入队时的模块边界。

## 影响

**正向：**
- `/performance` 大盘可读真实数据（Phase 2 T2.1.6 的数据源基线已就绪）
- 幂等写入（`event_id UNIQUE + ON CONFLICT DO NOTHING`）为 Gateway T1.3.5 幂等去重提前占位
- 索引提前优化 `(project_id, metric, ts_ms)` 常见查询

**成本：**
- 新增 runtime 依赖：`drizzle-orm`、`postgres`（合计 ~180KB，仅 server）
- 新增 3 个源文件（database、performance），约 150 LOC
- Gateway 单元测试需要注入 PerformanceService mock

**风险：**
- 本地 DB 未创建时 server 启动失败 → 通过清晰的 log + 错误指引缓解；e2e 测试不受影响（`NODE_ENV=test` 跳过）
- 当前字段裸单表，无分区 → 短期 OK；T1.1.5 会改为 `events_raw` 按 day 分区

## 后续

- T1.1.5 完整 Drizzle Schema（projects / project_keys / issues / events_raw 分区表）+ 引入 drizzle-kit CLI
- T1.3.2 Gateway 改为入队 BullMQ，PerformanceService 迁移到 ProcessorModule
- T2.1.4 PerformanceProcessor 产出 metric_minute 聚合表
- T2.1.6 Dashboard API 查询 perf_events_raw 驱动 `/performance` 大盘
