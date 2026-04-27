# ADR-0009: packages/shared 基线设计

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |
| 关联任务 | T1.1.4 |

## 背景

`packages/shared` 是 monorepo 中所有 apps（server / web / ai-agent）与 packages（sdk / cli / vite-plugin）的公共底座，需承载三类契约：

1. **事件载荷 Schema**（对应 SPEC §4）— SDK 构造 / Gateway 校验 / Processor 消费的同一份 Zod 定义
2. **BullMQ 队列名常量**（对应 ARCHITECTURE §3.4）— 生产端与消费端引用同一字符串，避免魔法字符串漂移
3. **环境变量 Schema**（对应 `.env.example` 11 段）— 各 app 启动时做一次性强校验

架构红线（`.claude/rules/architecture.md`）规定：
- `packages/shared` 仅允许依赖 zod
- 禁止引入 nestjs / react / langchain 等运行时框架
- 禁止运行时副作用（副作用 import、全局修改）
- SDK 从 shared 引用类型，故 shared 必须浏览器兼容（零 Node.js API）

本 ADR 固化四个基线选择：env 解析方式、env 切片策略、构建工具、Schema 文件粒度。

## 决策

### 1. Env：导出 Schema + 纯函数 `parseEnv`，不自动读 `process.env`

`packages/shared` 导出：

```typescript
export const BaseEnvSchema = z.object({ ... });
export const ServerEnvSchema = BaseEnvSchema.extend({ ... });
export const AiAgentEnvSchema = BaseEnvSchema.extend({ ... });

export function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  raw: Record<string, string | undefined>,
): z.infer<S>;
```

调用方（各 app）自行选择读取源（`process.env` / `@nestjs/config` / `dotenv`）并传入：

```typescript
// apps/server/src/main.ts
import { parseEnv, ServerEnvSchema } from '@g-heal-claw/shared';
const env = parseEnv(ServerEnvSchema, process.env);
```

### 2. Env 切片：Base + 按 app 扩展

对齐 `.env.example` 11 段：

| 段 | 归属 |
|---|---|
| 基础设施（DB / Redis / MinIO） | `BaseEnvSchema` |
| 应用运行时（NODE_ENV / ports / URLs） | `BaseEnvSchema` |
| 鉴权（JWT / Refresh） | `ServerEnvSchema` |
| 限流与采样 | `ServerEnvSchema` |
| 邮件（SMTP） | `ServerEnvSchema` |
| IP 地域库 | `ServerEnvSchema` |
| AI Agent（Claude / OpenAI / 步数） | `AiAgentEnvSchema` |
| Git 平台集成 | `AiAgentEnvSchema` |
| 沙箱 | `AiAgentEnvSchema` |
| 通知渠道（钉钉 / 企微 / Slack / SMS） | `ServerEnvSchema` |
| 可观测（日志 / OTEL / Prometheus） | `BaseEnvSchema` |

### 3. 构建工具：`tsc` 直出，不引入 Vite Library Mode

`packages/shared` 是**纯类型 + Zod Schema + 常量**包，无需 bundling、tree-shaking 或 minify。使用 `tsc --build` 输出 `dist/*.js` + `dist/*.d.ts`，`package.json` 的 `exports` 字段指向产物。

这是对 `.claude/rules/coding.md` 中"packages 使用 Vite Library Mode"的**显式例外**：Vite Library Mode 适用于 sdk / cli / vite-plugin 等需要浏览器兼容打包的包；纯类型包 `tsc` 更简单、零配置、产物更清晰。

同步更新 `.claude/rules/coding.md` 将 Vite Library Mode 改为"SDK / CLI / Vite Plugin 使用 Vite Library Mode；纯类型包使用 tsc"。

### 4. Schema 文件粒度：一子类型一文件

```
packages/shared/src/
├── index.ts                     # 桶式导出
├── env/
│   ├── base.ts                  # BaseEnvSchema
│   ├── server.ts                # ServerEnvSchema
│   ├── ai-agent.ts              # AiAgentEnvSchema
│   └── parse.ts                 # parseEnv 函数
├── queues/
│   └── names.ts                 # 队列名常量 + 类型
└── events/
    ├── base.ts                  # BaseEventSchema + Breadcrumb + NavigationTiming
    ├── error.ts                 # ErrorEventSchema
    ├── performance.ts           # PerformanceEventSchema
    ├── long-task.ts             # LongTaskEventSchema
    ├── api.ts                   # ApiEventSchema
    ├── resource.ts              # ResourceEventSchema
    ├── page-view.ts             # PageViewEventSchema
    ├── page-duration.ts         # PageDurationEventSchema
    ├── custom-event.ts          # CustomEventSchema
    ├── custom-metric.ts         # CustomMetricSchema
    ├── custom-log.ts            # CustomLogSchema
    ├── track.ts                 # TrackEventSchema
    ├── union.ts                 # SdkEventSchema 判别联合
    └── ingest.ts                # IngestRequestSchema（events 批量包装）
```

类型通过 `z.infer<typeof XxxSchema>` 导出；`index.ts` 做桶式 re-export。便于 SDK 插件按需引用，减少未来 tree-shake 压力。

## 备选方案

### A. 纯 Schema + parseEnv 纯函数（**采纳**）

- ✅ 零副作用、浏览器兼容
- ✅ 易测试（传 fixture 即可）
- ✅ 多 app 独立选择读取方式
- ❌ 调用方多一行 boilerplate

### B. 导出 `loadEnv()` 直接读 `process.env`

- ❌ 引入 Node.js `process` 全局（SDK 引用时浏览器报 ReferenceError，除非 polyfill）
- ❌ 违反"零副作用"约束
- ❌ 不易在 Vitest 中 stub

### C. 单文件 `events.ts` 全量 Schema

- ✅ 简单、import 路径短
- ❌ SDK tree-shake 友好度差（Zod Schema 相互引用使静态分析难以剪枝）
- ❌ 文件超 500 行后可维护性下降

### D. Vite Library Mode 打包 shared

- ❌ 对纯类型包无收益（无需压缩、tree-shake）
- ❌ 增加配置复杂度
- ❌ 产物被 Vite wrap，丢失 `tsc` 原生的 `.d.ts` 路径映射

## 影响

### 正向

- **零架构风险**：严守 shared 纯净红线
- **扩展性**：未来新增 app（如独立 Worker）只需 `extend(BaseEnvSchema)` 加自己的字段
- **双端契约**：SDK 与 Gateway 共用 `SdkEventSchema`，消除契约漂移
- **可测试**：`parseEnv` 是纯函数，单测覆盖所有校验分支无需 mock `process`

### 负向 / 成本

- 14 个 Zod Schema 文件（vs 单文件）初始搭建工作量略增（约 +30min）
- `.claude/rules/coding.md` 需同步更新构建工具描述

### 对现有契约的改动

- **SPEC.md**：无改动（本 ADR 是实现层决策，不影响契约）
- **ARCHITECTURE.md**：§3.4 队列清单 12 条在本次落地为常量，后续新增队列必须同步更新此表与 `queues/names.ts`
- **`.claude/rules/coding.md`**：更新"packages 构建工具"描述（见 Phase 4 收尾）

## 后续

- T1.1.4 落地本 ADR（子任务拆解见 `docs/tasks/CURRENT.md`）
- T1.1.3 `apps/server` 初始化时消费 `ServerEnvSchema` 验证
- T1.2.1 SDK 骨架落地时消费 `SdkEventSchema` 与 `parseEnv` 无关，但事件 Schema 复用
- 后续新增 env 字段必须同步 `.env.example` + 对应 `*EnvSchema` + 本 ADR（若切片归属变化）
