# apps/server/drizzle

Drizzle 迁移源真值目录（ADR-0017 §2）。

## 当前文件

- `0001_initial.sql` — 首版基线：8 张主表 + 3 张事件流表（含 events_raw 父表 + 4 张周分区）

## 执行方式

**dev / test**：无需手工执行。`DatabaseService.onModuleInit` 启动期跑 `ALL_DDL`（`src/shared/database/ddl.ts`），与本目录 SQL 手工对齐。

**CI / production**：
```bash
pnpm -F @g-heal-claw/server db:migrate
```

## 约定

- 文件名：`NNNN_slug.sql`（drizzle-kit 约定；手写时严格对齐）
- 必须使用 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` 保证幂等（允许在跑过 `ALL_DDL` 的 dev DB 上重放）
- Schema 变更时：
  1. 修改 `src/shared/database/schema/*.ts`
  2. 尝试跑 `pnpm db:generate` 自动产出；若 drizzle-kit 加载失败（目前 0.30 与 NodeNext `.js` 扩展不兼容），手写新迁移文件
  3. 同步更新 `ddl.ts` 的 `ALL_DDL` 常量
  4. T1.1.8 CI 启用后，流水线会 diff 两者确保一致

## 已知限制

- `drizzle-kit` 0.30 的 CJS 加载器不解析 `.js` 扩展重写（NodeNext 场景），目前手工维护迁移文件
- `PARTITION BY RANGE` / `PARTITION OF` 分区语法 drizzle-kit 不支持原生生成，需手写 SQL 片段
