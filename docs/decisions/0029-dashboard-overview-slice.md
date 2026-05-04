# ADR-0029: 数据总览切片（TM.3.A · 5 域 MVP + 全站健康度）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-30 |
| 决策人 | @Robin |

## 背景

ADR-0020 Tier 3 明确 `/dashboard/overview` 的职责是"拼接前 9 个模块汇总卡 + 全站健康度"。当前 `(console)/dashboard/overview/page.tsx` 仍是 `PlaceholderPage`，是侧边栏 4 分组中最后一块占位。

现状：
- 已 live 可直接聚合：errors / performance / api / resources / visits（5 域均有 `aggregateSummary` 或等价方法）
- 异质性强、收益有限：custom / logs / tracking（custom 无核心 KPI、logs 无聚合 API 只能数级别计数、tracking 3 子面板各不相同）
- 用户侧价值集中在"一屏看到系统是否健康 + 哪里出了问题"，不需要把 9 个模块的全部卡都复制一遍

约束：
- 零 SDK 变更、零新表、零新依赖（仅装配层）
- 三态 `source: live | empty | error` 契约复用
- 无 RBAC（T1.1.7 未交付），沿用 `NEXT_PUBLIC_DEFAULT_PROJECT_ID`
- 两窗口环比逻辑统一使用 `WindowParams { sinceMs, untilMs }` 模式

## 决策

### 1. 范围：5 域 MVP

只聚合 5 个已 live 的核心域，放弃在 overview 里重复展示 custom/logs/tracking：

| 域 | 核心指标卡 | 数据源 |
|---|---|---|
| errors | 总事件数 · 受影响会话 · 环比 | `ErrorsService.aggregateSummary` |
| performance | LCP p75 · INP p75 · CLS p75 · 健康等级 | `PerformanceService.aggregateVitals` |
| api | 请求数 · 错误率 · p75 时延 | `ApiService.aggregateSummary` |
| resources | 资源请求数 · 失败率 · 慢资源数 | `ResourcesService.aggregateSummary` |
| visits | PV · UV · SPA 占比 | `VisitsService.aggregateSummary` |

### 2. 全站健康度（Health Score）

单一 0~100 评分 + 三态 tone（`good ≥ 85` / `warn 60~84` / `destructive < 60`），加权公式：

```
health = 100
  − penalty(errors.rate, weight=40)          // 错误率 > 0.5% 开始扣分
  − penalty(vitals.lcp_tone, weight=25)      // LCP p75 destructive 扣满
  − penalty(api.error_rate, weight=20)       // API 错误率 > 1% 开始扣分
  − penalty(resources.failure_rate, weight=15) // 资源失败率 > 2% 开始扣分
```

- 每一项独立计算 0~1 的 penalty 比例后乘权重
- 有样本才参与计算，空样本域权重挪给其他域（按比例重分配）
- `source=error` 时整个 health 降级为 `unknown` tone，不骗评分

### 3. 接口契约

单一端点 `GET /dashboard/v1/overview/summary`：

```typescript
// query
{ projectId: string; windowHours?: number = 24 }

// response.data
{
  health: { score: number; tone: "good"|"warn"|"destructive"|"unknown"; components: HealthComponentDto[] };
  errors:       { totalEvents, impactedSessions, deltaPercent, deltaDirection, source };
  performance:  { lcpP75, inpP75, clsP75, tone, source };
  api:          { totalRequests, errorRate, p75DurationMs, source };
  resources:    { totalRequests, failureRate, slowCount, source };
  visits:       { pv, uv, spaRatio, source };
  generatedAtMs: number;
}
```

- 每个域携带独立 `source`（便于局部降级）
- 装配层 `DashboardOverviewService` 用 `Promise.allSettled` 并发调 5 个域 service，单域失败只把该域 `source=error`，不影响其他
- health 组件 `components[]` 透出每项扣分明细，便于前端 tooltip 展开

### 4. 前端结构

`(console)/dashboard/overview/page.tsx`：

```
┌─ HealthHeroCard ──────────────────┐
│ Score 82 · warn · "3 项关注"       │
│ ├ errors  -8 pts                  │
│ ├ lcp     -10 pts                 │
│ └ ...                             │
└───────────────────────────────────┘
┌───────┬───────┬───────┬───────┬───────┐
│errors │perf   │api    │resourc│visits │
│卡     │卡     │卡     │es 卡   │卡     │
└───────┴───────┴───────┴───────┴───────┘
```

- 顶部 `HealthHeroCard`（score + tone + top 3 扣分项）
- 下方 5 个等宽 `DomainSummaryCard`，每张卡展示 2~3 个核心 KPI + 跳转链接 → 对应子页
- 三态 `SourceBadge` 复用

### 5. 目录落位

新增 `apps/server/src/dashboard/dashboard/`（对齐 web `(console)/dashboard/` 分组），包含：
- `overview.controller.ts` / `overview.service.ts` / `dto/overview-summary.dto.ts`
- `DashboardModule` 追加导入 + 注册

## 备选方案

### A. 完整 9 域拼接（Tier 3 原定）
- 优点：菜单完整性语义更强
- 缺点：custom/logs 卡片需要为 overview 专门设计"低信号密度"卡（只有 `eventName count` 之类弱指标），维护成本高；tracking 3 子面板的 overview 化需要单独 ADR 才能定；工期从 1.5d 膨胀到 3d
- 不选：收益与成本不匹配，且 overview 的用户价值在"健康度 + 重点域"，不在"模块全家福"

### B. 纯前端组合（并行调 5 个 overview 接口）
- 优点：后端零改动
- 缺点：前端串 5 个请求（无法在一个 HTTP 里原子失败降级），打开页面要 5 个 loading；health 公式要落到前端意味着 Web 成为"业务计算"承载者，违反装配层原则
- 不选：health 必须由服务端权威计算

### C. 服务端 materialized view（每 5 分钟预聚合）
- 优点：响应最快
- 缺点：引入新表/调度器/回填机制，首版过度设计
- 不选：5 域 `Promise.all` 在 24h 窗口下足够快（每域 < 50ms），首版不必要

## 影响

### 收益
- 10 个菜单最后一块占位 live 化，ADR-0020 Tier 3 完成收口
- 全站健康度提供单一 NSM（North Star Metric）视图，取代过去"多页跳转才能判断"的体感
- 为后续"SSE 推送 health score 增量"（ADR-0030）提供权威数据源

### 成本
- 1.5d 工期（装配层 + DTO + 前端页面 + 测试 + demo + docs）
- `DashboardOverviewService` 约 200 行（含 health 计算 + 空样本降权）
- 前端 `overview/page.tsx` 约 120 行（HealthHeroCard + 5 张 DomainSummaryCard）

### 风险
- **health 权重争议**：首版权重是经验值，发布后会收到"某项是否过度敏感"反馈 → 用常量表集中管理，后续可无痛调；不在 DB 里硬编码
- **空数据页**：新项目 5 域都 empty → health 无法计算 → 显式返回 `tone=unknown`、`components=[]`，前端渲染 "暂无数据接入" 引导页

## 后续

- 任务：`TM.3.A.1` ~ `TM.3.A.5`（见 `docs/tasks/CURRENT.md`）
- Demo：`examples/nextjs-demo/app/(demo)/dashboard/overview/page.tsx`（触发 5 域样本的合成脚本按钮）
- 使用说明：`apps/docs/docs/guide/dashboard/overview.mdx`
- 与 ADR-0030 联动：overview 数据流可作为 realtime SSE 的基础，「最新 health score」作为首批推送 topic
- 后续增量切片（推迟）：
  - 扩展到 9 域（需要定义 custom/logs/tracking 在 overview 的卡片形态）
  - health 权重可配置（项目级 settings）
  - health 历史趋势（7d 走势图）
