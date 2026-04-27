# ADR-0017: Drizzle Schema 首版基线（多租户主表 + events_raw 分区骨架 + drizzle-kit 迁移源）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

当前 `apps/server/src/shared/database/schema.ts` 只有两张切片表（`perf_events_raw` / `error_events_raw`，ADR-0013 / 0016）。没有任何多租户根表，后续所有能力都被卡住：

- **DSN 鉴权（T1.3.2）** 需要 `project_keys.public_key` 查询
- **项目级限流（T1.3.3）** 需要 `projects.id` 作为令牌桶维度
- **多租户 Guard（T1.1.7）** 需要 `project_members` + `users`
- **Sourcemap 上传（T1.5）** 需要 `releases` + `release_artifacts`
- **完整 ErrorProcessor（T1.4.1）** 需要 `issues` 表做指纹 UPSERT

当前 demo 全部用硬编码 `projectId=demo` / `publicKey=pk` 工作，属于切片权宜；必须在下一步引入 BullMQ / 鉴权之前，把主表一次性建好并落进版本控制的 DDL 源真值。

与此同时，DDL 管理方式也到了必须决策的时刻：`DatabaseService.onModuleInit` 跑 `ALL_DDL` 字符串数组的方式，对 dev/test 零配置很友好，但：

- 字段增删改 DDL 语义无法完整表达（尤其涉及默认值填充、列改名、数据迁移）
- 生产环境需要人工可审计的 SQL 文件用于 DBA review / 回滚
- 单元测试需要与生产迁移完全一致的 Schema 状态

约束：

- 不触碰已有切片表（`perf_events_raw` / `error_events_raw`）的字段，仅**追加** `projects` 等新表 + 对应索引
- 不引入 `drizzle-orm/migrator` 运行时依赖（production 走 `drizzle-kit migrate` 的 SQL 文件，不内嵌 JS 执行）
- 不改动 SDK / web / ai-agent；仅 apps/server + 文档
- 不落地 Controller / Service / Guard 业务逻辑 —— 只到"表可被 DI 的 Drizzle 客户端读写"为止

## 决策

### 1. ID 策略：主表用前缀 nanoid，事件流表保持 bigserial

| 表类型 | ID 类型 | 示例 | 理由 |
|---|---|---|---|
| **主表**（projects / users / releases / issues / ...） | `varchar(32)` + 前缀 nanoid | `proj_8zK3nXvqW4`、`usr_...`、`rel_...`、`iss_...` | 日志可读、避免枚举攻击、与现有切片表 `project_id varchar(64)` 天然契合 |
| **关联表**（project_members / environments） | 复合主键 | `(project_id, user_id)`、`(project_id, name)` | 无需单独 ID |
| **事件流表**（events_raw 及其分区 / perf_events_raw / error_events_raw） | `bigserial` | `1, 2, 3, ...` | 高频写入性能；`event_id uuid` 才是幂等键 |

前缀 nanoid 实现：`packages/shared/src/id.ts` 新增 `generateId(prefix)` 纯函数（`nanoid` 21 字节字母数字 → 取前 10 位拼 `prefix_`）；事件 `event_id` 保持 SDK 生成的 UUIDv4。

### 2. 迁移工具：drizzle-kit 生成 SQL + 双执行路径

| 环境 | DDL 执行方式 | 理由 |
|---|---|---|
| dev / test | `DatabaseService.onModuleInit` 继续跑 `ALL_DDL`（幂等 `CREATE IF NOT EXISTS`） | 零配置，本地启动即可用；pg-mem / Dockerized PG 一致性 |
| CI / production | `drizzle-kit migrate` 跑 `apps/server/drizzle/*.sql` 迁移文件 | DBA 可审计 / 回滚 / 逐步发布 |

**迁移源真值**：
- `apps/server/drizzle.config.ts` → `drizzle-kit generate` 输出到 `apps/server/drizzle/`
- 每次 schema 变更产出一个新迁移文件（`0001_initial.sql` / `0002_xxx.sql`）
- `ALL_DDL` 常量由 `generate-ddl.ts` 脚本从迁移文件拼装（保证两条路径字节级一致），或直接从 Drizzle schema 生成；**本期**保持 `ALL_DDL` 手写，与迁移文件手工对齐（一次性成本可接受，T1.1.8 CI 后补 diff 校验）

**devDependency 清单**：
- `drizzle-kit@^0.24`（已用 `drizzle-orm@^0.33`）
- `nanoid@^5`（SDK 早已内置，apps/server 需单独装）

### 3. 表清单（本期新增）

#### 3.1 users（认证主体最小字段）

```sql
CREATE TABLE IF NOT EXISTS users (
  id              varchar(32) PRIMARY KEY,           -- usr_xxx
  email           varchar(255) NOT NULL UNIQUE,
  password_hash   varchar(255) NOT NULL,             -- argon2id / bcrypt 选型随 T1.1.7
  display_name    varchar(64),
  role            varchar(16) NOT NULL DEFAULT 'user', -- 'user' | 'admin'（系统级，非项目级）
  is_active       boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
```

#### 3.2 projects（多租户根）

```sql
CREATE TABLE IF NOT EXISTS projects (
  id              varchar(32) PRIMARY KEY,           -- proj_xxx
  slug            varchar(64) NOT NULL UNIQUE,       -- URL 友好（"demo" / "acme-web"）
  name            varchar(128) NOT NULL,
  platform        varchar(16) NOT NULL DEFAULT 'web',-- 'web' | 'miniapp' | 'mobile'
  owner_user_id   varchar(32) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  retention_days  integer NOT NULL DEFAULT 30,       -- 事件保留天数
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_user_id);
```

**迁移路径**：已有 `perf_events_raw.project_id` / `error_events_raw.project_id` **不加 FK**（切片表独立演进，兼容 demo 硬编码 `projectId=demo`）；T1.4.1 Processor 迁移到 `events_raw` 分区时一并补 FK。

#### 3.3 project_keys（DSN 鉴权键）

```sql
CREATE TABLE IF NOT EXISTS project_keys (
  id              varchar(32) PRIMARY KEY,           -- pk_xxx
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  public_key      varchar(64) NOT NULL UNIQUE,       -- SDK DSN 公开半
  secret_key      varchar(64) NOT NULL UNIQUE,       -- CLI / Sourcemap 私有半
  label           varchar(64),                       -- "prod" / "staging" / 自定义
  is_active       boolean NOT NULL DEFAULT true,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_keys_public ON project_keys (public_key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_project_keys_project ON project_keys (project_id);
```

**partial index** `WHERE is_active = true` 让 Gateway 鉴权查询（T1.3.2）只走热集合。

#### 3.4 project_members（RBAC）

```sql
CREATE TABLE IF NOT EXISTS project_members (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         varchar(32) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            varchar(16) NOT NULL,              -- 'owner' | 'admin' | 'member' | 'viewer'
  invited_by      varchar(32) REFERENCES users(id) ON DELETE SET NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON project_members (user_id);
```

#### 3.5 environments

```sql
CREATE TABLE IF NOT EXISTS environments (
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            varchar(32) NOT NULL,              -- 'production' | 'staging' | 'development' | 自定义
  description     text,
  is_production   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, name)
);
```

#### 3.6 releases

```sql
CREATE TABLE IF NOT EXISTS releases (
  id              varchar(32) PRIMARY KEY,           -- rel_xxx
  project_id      varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version         varchar(64) NOT NULL,
  commit_sha      varchar(40),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS idx_releases_project_created ON releases (project_id, created_at DESC);
```

#### 3.7 issues（异常聚合 —— 字段预留，本期不写入）

```sql
CREATE TABLE IF NOT EXISTS issues (
  id                    varchar(32) PRIMARY KEY,     -- iss_xxx
  project_id            varchar(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  fingerprint           varchar(64) NOT NULL,        -- sha1(subType + normalizedMessage + topFrame)
  sub_type              varchar(16) NOT NULL,        -- 与 error_events_raw.sub_type 一致
  title                 text NOT NULL,               -- 代表消息（= first event message_head）
  level                 varchar(16) NOT NULL DEFAULT 'error',
  status                varchar(16) NOT NULL DEFAULT 'open', -- open | resolved | ignored
  first_seen            timestamptz NOT NULL DEFAULT now(),
  last_seen             timestamptz NOT NULL DEFAULT now(),
  event_count           bigint NOT NULL DEFAULT 0,
  impacted_sessions     bigint NOT NULL DEFAULT 0,
  assigned_user_id      varchar(32) REFERENCES users(id) ON DELETE SET NULL,
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_issues_project_status_lastseen ON issues (project_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_issues_project_subtype_lastseen ON issues (project_id, sub_type, last_seen DESC);
```

**状态**：首版**仅建表**，ErrorsService 当前不写入 `issues`（分组仍走 `error_events_raw.message_head` 字面键，ADR-0016）；T1.4.2 指纹落地后 ErrorProcessor 才开始 UPSERT。Dashboard Controller 契约不变，查询源届时从 `error_events_raw` 切到 `issues`。

#### 3.8 events_raw（通用归档父表 + 周分区骨架）

```sql
-- 父表：按 ingested_at 周分区（PARTITION BY RANGE）
CREATE TABLE IF NOT EXISTS events_raw (
  id              bigserial,
  event_id        uuid NOT NULL,
  project_id      varchar(32) NOT NULL,              -- 暂不加 FK（写入性能）
  type            varchar(32) NOT NULL,              -- 'error' | 'performance' | 'api' | ...
  payload         jsonb NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, ingested_at)                      -- 分区键必须进 PK
) PARTITION BY RANGE (ingested_at);

-- 初始 4 张周分区（覆盖本月前后 4 周）
CREATE TABLE IF NOT EXISTS events_raw_2026w17
  PARTITION OF events_raw FOR VALUES FROM ('2026-04-20') TO ('2026-04-27');
CREATE TABLE IF NOT EXISTS events_raw_2026w18
  PARTITION OF events_raw FOR VALUES FROM ('2026-04-27') TO ('2026-05-04');
CREATE TABLE IF NOT EXISTS events_raw_2026w19
  PARTITION OF events_raw FOR VALUES FROM ('2026-05-04') TO ('2026-05-11');
CREATE TABLE IF NOT EXISTS events_raw_2026w20
  PARTITION OF events_raw FOR VALUES FROM ('2026-05-11') TO ('2026-05-18');

-- 仅在父表上建索引（自动下推到所有子分区）
CREATE INDEX IF NOT EXISTS idx_events_raw_project_type_ingested
  ON events_raw (project_id, type, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_raw_event_id ON events_raw (event_id);
```

**本期定位**：
- 仅建父表 + 首批 4 周分区 + 索引骨架；**Gateway 不写入**（继续走切片表 `perf_events_raw` / `error_events_raw`）
- 分区维护脚本（每周新建下周分区 + 归档历史分区）延后到 T1.4.1
- 当 T1.4.1 完整 Processor 落地时，Gateway 切换为统一 `events_raw.INSERT`，切片表降级为特化索引/物化视图

### 4. 文件布局

```
apps/server/
├── drizzle.config.ts                            # 新增：drizzle-kit 配置
├── drizzle/                                     # 新增：迁移源真值
│   └── 0001_initial.sql                         # drizzle-kit generate 产出
└── src/shared/database/
    ├── schema.ts                                # 现有：拆分为多个子文件并 re-export
    ├── schema/
    │   ├── users.ts                             # 新增
    │   ├── projects.ts                          # 新增（含 project_keys / project_members / environments）
    │   ├── releases.ts                          # 新增
    │   ├── issues.ts                            # 新增
    │   ├── events-raw.ts                        # 新增（父表 + 分区 DDL）
    │   ├── perf-events-raw.ts                   # 从现 schema.ts 拆出
    │   └── error-events-raw.ts                  # 从现 schema.ts 拆出
    ├── ddl.ts                                   # 现有：ALL_DDL 扩展到 8 张表 + 分区
    └── database.service.ts                     # 现有：onModuleInit 逻辑不变
```

`schema.ts` 作为桶式入口，`export * from "./schema/users.js"` 等，对外兼容现有 import 路径。

### 5. packages/shared 增量

```
packages/shared/src/
└── id.ts                                        # 新增：generateId(prefix: string): string
```

- 依赖 `nanoid@^5`（已是生态标准，浏览器 / Node 双端可用；SDK 侧暂不引入）
- 导出 `PROJECT_ID_PREFIX = "proj"` 等常量便于上层拼装

## 备选方案

**备选 A：全表用 `bigserial` 数字主键**。放弃：日志中 `project_id=123` 完全不可读，要么查库要么加缓存；前缀 nanoid 在写入性能上几乎无差异（20 字节 varchar 索引对比 8 字节 bigint，p99 query < 5ms 差异可忽略）。

**备选 B：切片表立刻并入 `events_raw` 分区**。放弃：`perf_events_raw` / `error_events_raw` 的索引结构（`idx_perf_project_metric_ts` / `idx_err_project_group_ts`）针对 Dashboard 查询专用优化；合并进 `events_raw` 通用 `jsonb payload` 后查询成本激增。T1.4.1 完整 Processor 落地时再评估是否拆表 vs JSON GIN 双轨。

**备选 C：完全弃用 `ALL_DDL` 改走 `drizzle-kit migrate` 双轨**。放弃：dev/test 零配置是关键生产力，pg-mem 能跑的前提是纯 `CREATE IF NOT EXISTS` 字符串；迁移文件与 `ALL_DDL` 并存本期手工对齐，CI diff 校验（T1.1.8）后自动化。

**备选 D：`issues` 表延后到 T1.4.1 再建**。放弃：Schema 首版就应覆盖全部业务域核心表，Dashboard API 契约里 `/api/v1/projects/:id/issues` 明确要求此表存在；先建表不写入的成本极低，避免 T1.4.1 时还要改迁移。

**备选 E：`events_raw` 初始只建父表 + 1 个 current 分区**。放弃：初始建 4 周让团队立刻看清楚分区管理模式，"每周新建下周分区"的定时脚本在 T1.4.1 落地时不用动表结构。

## 影响

**正向**：
- 解锁 T1.1.7（认证） / T1.3.2（Gateway DSN 鉴权） / T1.3.3（限流） / T1.5（Sourcemap） / T1.4.1（完整 Processor）
- `drizzle-kit` 迁移源真值进入版本控制，生产可审计
- 前缀 nanoid 让日志 / 监控 / trace 立刻可读
- Schema 按业务域拆文件，新增表的认知成本下降

**成本**：
- 新增 8 张表 DDL + 3~5 个 FK 约束 + 10+ 索引
- apps/server devDependency：`drizzle-kit@^0.24` + `nanoid@^5`
- 手工维护 `ALL_DDL` 与 `drizzle/*.sql` 的一致性（T1.1.8 自动化前约 5 分钟/次变更）

**风险**：
- 初始 4 周分区过期后（2026-05-18+）若未接入维护脚本，写入会失败 → **必须在 T1.4.1 前落地分区维护 cron**，或在 T1.4.1 未到前不让 Gateway 往 `events_raw` 写（本期实际就是这样）
- `drizzle-kit generate` 对某些 PostgreSQL 高级语法（RANGE 分区）支持有限，分区 DDL 可能需要手写 SQL 片段 → 本期接受手工维护
- 前缀 nanoid 碰撞概率：10 位字母数字 ≈ 56 bit entropy，单表 1B 行碰撞概率 < 10^-6，完全可接受

## 后续

- 跟踪 T1.1.5（本 ADR 落地的唯一任务主体）
- T1.1.7 认证落地时：`users.password_hash` 决定 argon2id；新增 `user_sessions` 表（或 Redis 存 JWT refresh）
- T1.3.2 Gateway 接入：新建 `project-keys.service.ts` + Redis 缓存 `gateway:key:<publicKey>` → `projectId`
- T1.4.1 完整 ErrorProcessor：Gateway 改走 BullMQ；ErrorProcessor 消费 `events-error` → `events_raw` 分区 + `issues` UPSERT；`error_events_raw` 保留为查询优化副本或废弃（决策时新写 ADR）
- T1.1.8 CI 流水线：加 `drizzle-kit check` + `ALL_DDL` 与迁移文件 diff 校验
- T1.5 Sourcemap：新增 `release_artifacts` 表；通过新 ADR 或本 ADR 增量
