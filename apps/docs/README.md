# @g-heal-claw/docs

面向用户的文档站点（Rspress 驱动）。依据 [ADR-0022](../../docs/decisions/0022-docs-system-rspress.md)。

## 本地开发

```bash
pnpm -F @g-heal-claw/docs dev        # http://localhost:4000
pnpm -F @g-heal-claw/docs build      # 产物在 doc_build/
pnpm -F @g-heal-claw/docs preview    # 预览构建产物
```

## 内容约定

- **单一事实源**：`docs/*.md`（PRD / ARCHITECTURE / DESIGN / SPEC / ADR / tasks）为工程决策源真值
- 本站点是**派生视图**，面向使用者；不复制工程文档，精简重写或相对链接引用
- 目录结构：
  - `docs/guide/` 入门与接入
  - `docs/concepts/` 架构与数据模型
  - `docs/api/` SDK / Ingest / Dashboard API 参考
  - `docs/adr/` 决策记录索引（指向仓库 `docs/decisions/`）

## 端口约定

| 应用 | 端口 |
|---|---|
| server | 3000 |
| web | 3100 |
| demo | 3200 |
| docs | **4000** |
