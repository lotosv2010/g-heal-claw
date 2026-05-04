# 数据总览

路径：Dashboard → **数据总览** `/dashboard/overview`

> 状态：已交付（ADR-0029 · TM.3.A）

## 能力简介

一屏回答三件事：

1. **系统是否健康？** —— 顶部 `HealthHeroCard` 给出 0~100 总评分与四态色（good / warn / destructive / unknown），并展开扣分最多的 Top 3 分量
2. **哪个领域在扣分？** —— 下方 5 张等宽卡（异常 / 性能 / API / 资源 / 访问），每卡 2~3 个核心 KPI 并可一键跳转子页
3. **数据是否可信？** —— 任一域失败只让该卡降级为 `数据异常` 徽标，不影响其他域

## 健康度公式

服务端权威计算（不在前端推导），加权总分 = 100 − Σ(分量扣分)：

| 分量 | 权重 | signal | 扣分规则 |
|---|---|---|---|
| 异常率 | 40 | `totalEvents / (impactedSessions × 100)` | > 0.5% 起扣，≥ 5% 扣满 |
| 性能 (LCP p75) | 25 | `lcpP75Ms` | good=0 / warn=0.6 × weight / destructive=weight |
| API 错误率 | 20 | `failedCount / totalRequests` | > 1% 起扣，≥ 10% 扣满 |
| 资源失败率 | 15 | `failedCount / totalRequests` | > 2% 起扣，≥ 20% 扣满 |

空样本域的权重会按比例重分配给其他活跃域；全域空样本时 `score=null, tone=unknown`，前端渲染"数据不足"引导。

## 接口

`GET /dashboard/v1/overview/summary?projectId=xxx&windowHours=24`

```jsonc
{
  "data": {
    "health": {
      "score": 82,
      "tone": "warn",
      "components": [
        { "key": "errors", "signal": 0.012, "weight": 40, "deducted": 5.2 },
        { "key": "performance", "signal": 3100, "weight": 25, "deducted": 15 }
      ]
    },
    "errors":      { "totalEvents": 132, "impactedSessions": 41, "deltaPercent": 12.4, "deltaDirection": "up", "source": "live" },
    "performance": { "lcpP75Ms": 3100, "inpP75Ms": 220, "clsP75": 0.08, "tone": "warn", "source": "live" },
    "api":         { "totalRequests": 9840, "errorRate": 0.0082, "p75DurationMs": 310, "source": "live" },
    "resources":   { "totalRequests": 21300, "failureRate": 0.001, "slowCount": 12, "source": "live" },
    "visits":      { "pv": 5823, "uv": 1840, "spaRatio": 0.36, "source": "live" },
    "generatedAtMs": 1751289600000,
    "windowHours": 24
  }
}
```

## 配置项

| 变量 | 作用 |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | apps/server 基地址 |
| `NEXT_PUBLIC_DEFAULT_PROJECT_ID` | 默认项目 ID（T1.1.7 之前固定使用） |

## 常见问题

- **为什么 health.score 是 null？** —— 5 域均 `source=empty`，通常是新项目刚接入未产生流量。运行 `pnpm dev:demo` 的"数据总览触发器"一键生成样本。
- **某个域 `source=error` 会拉低分数吗？** —— 不会。`error` 与 `empty` 都会退出评分，权重按比例分给其他活跃域，避免瞬时故障变成永久扣分。
- **权重能改吗？** —— 目前硬编码在 `apps/server/src/dashboard/dashboard/overview.service.ts#BASE_WEIGHTS` / `DEDUCT_RULES`，以常量集中管理。后续项目级 settings 可配置会作为独立切片（ADR-0029「后续」）。

## Demo 场景

`/dashboard/overview`（examples/nextjs-demo/app/(demo)/dashboard/overview/page.tsx）：一键触发 errors + api + resources + LCP 样本，驱动后台总览页面从 empty 切换到 live。

## 决策记录

- [ADR-0029](../../../../../docs/decisions/0029-dashboard-overview-slice.md)：5 域 MVP + 健康度加权公式 + Promise.allSettled 装配
