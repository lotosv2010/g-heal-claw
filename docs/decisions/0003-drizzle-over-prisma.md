# ADR-0003: 使用 Drizzle 而非 Prisma 作为 ORM

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

项目需要一个 TypeScript ORM 管理 PostgreSQL 数据库。核心诉求：
- 类型安全的 Schema 定义 + 查询构造
- 支持 PostgreSQL 高级特性（分区表、JSONB、数组、CTE）
- 迁移管理（增量 DDL 可审计）
- 运行时零 client generation（构建产物精简）

## 决策

使用 **Drizzle ORM** + `postgres.js` 驱动：

1. **Schema as Code** — TypeScript 定义即真值，无 `prisma generate` 步骤
2. **原生 SQL 模板** — `sql\`...\`` 模板允许写复杂聚合（CTE、window function、percentile_cont）而不失类型安全
3. **分区表支持** — 手写 DDL + Drizzle Schema 双轨并行（Drizzle 不原生支持 PARTITION BY，但查询层完全兼容）
4. **轻量运行时** — 无 binary engine，启动快，部署体积小
5. **迁移** — `drizzle-kit` 管理（手写 SQL 作为源真值，详见 ADR-0017）

## 备选方案

| 方案 | 评估 |
|---|---|
| **Prisma** | Client generation 步骤繁琐；复杂 SQL（CTE/分区/聚合）需 `$queryRaw` 退化到字符串；binary engine 部署体积大 |
| **TypeORM** | 装饰器 Schema 与 NestJS 亲和但类型推导弱；Active Record 模式与 DI 理念冲突；复杂查询能力不足 |
| **Knex.js** | 查询构造灵活但无 Schema 层类型推导；需手动维护类型定义 |
| **原生 postgres.js** | 无 Schema 类型安全；每条查询需手动映射；无迁移工具 |

## 影响

- **收益**：类型安全 + 原生 SQL 能力兼得；零 generate 步骤；启动快
- **成本**：生态不如 Prisma 成熟（文档、社区插件）；部分 DDL 需手写
- **缓解**：Schema 文件按域拆分（`schema/*.ts`）；DDL 在 `ddl.ts` 统一管理

## 后续

- Schema 基线见 ADR-0017
- 复杂聚合查询实践见各 Service 的 `sql\`...\`` 用法
