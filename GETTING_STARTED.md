# 快速开始

> 本指南帮助开发者在 15 分钟内跑通 g-heal-claw 本地开发环境，并串联 SDK 上报 → Dashboard 可视化 → AI 自愈 PR 的完整链路。
>
> **仓库状态**：Phase 1 开发中。`apps/*` 与 `packages/*` 子包尚未初始化，本文档描述目标形态与逐步启用路径。路线图见 `docs/tasks/CURRENT.md`。

---

## 前置条件

| 组件 | 最低版本 | 用途 |
|---|---|---|
| Node.js | 22.x LTS | 构建与运行 |
| pnpm | 10.x | Monorepo 包管理 |
| Docker Desktop | 最新稳定版 | PostgreSQL / Redis / MinIO |
| Git | 2.40+ | 版本控制 |
| （可选）Claude API Key | — | AI Agent 自愈 |
| （可选）GitHub PAT | — | Heal 自动 PR 创建 |

**操作系统支持**：macOS、Linux、Windows 10/11。Windows 用户建议在 Git Bash 或 WSL2 下运行 pnpm 命令。

---

## 1. 克隆与依赖安装

```bash
git clone <your-fork-url> g-heal-claw
cd g-heal-claw
pnpm install
```

pnpm workspaces + Turborepo 会自动解析 `packages/*` 与 `apps/*` 的本地依赖关系。安装完成后，根目录的 `node_modules` 与各包的 `node_modules` 都会通过硬链接共享磁盘。

---

## 2. 启动基础设施

```bash
docker compose up -d
```

启动以下容器：

| 服务 | 端口 | 用途 |
|---|---|---|
| PostgreSQL 17 | `5432` | 主数据存储（分区表 + 物化视图） |
| Redis 7 | `6379` | BullMQ 队列 + 限流 + 缓存 + Pub/Sub |
| MinIO | `9000` / `9001` | 开发期对象存储（Sourcemap / 大字段） |

登录 MinIO 控制台：`http://localhost:9001`（默认 `minioadmin` / `minioadmin`），首次启动后手动创建 `ghc-sourcemaps` bucket（生产使用 S3 时跳过）。

---

## 3. 环境变量配置

```bash
cp .env.example .env
```

`.env.example` 已覆盖 11 个配置段。**Phase 1 阶段至少要填写**：

```bash
# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ghealclaw

# Redis
REDIS_URL=redis://localhost:6379

# Storage (MinIO 开发)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=ghc-sourcemaps
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin

# JWT
JWT_SECRET=<openssl rand -base64 32 生成>

# AI Agent（Phase 5 启用，前期可留空）
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

`packages/shared/env.ts` 使用 Zod Schema 校验所有环境变量，缺失关键值时 server 启动失败。详细字段说明见 `.env.example` 内注释。

---

## 4. 数据库迁移

Drizzle Schema 位于 `apps/server/src/shared/database/schema/`。初始化数据库：

```bash
# 生成最新迁移
pnpm -F @g-heal-claw/server drizzle:generate

# 应用迁移到本地 PostgreSQL
pnpm -F @g-heal-claw/server drizzle:migrate
```

> Phase 1 任务 `T1.1.5` 完成后此命令可用。在此之前可手动执行 `docs/tasks/CURRENT.md` 中列出的首版 Schema。

---

## 5. 启动开发服务

### 5.1 一键启动（推荐）

```bash
pnpm dev
```

Turborepo 并行拉起：

- `apps/server` — NestJS (Fastify adapter)，监听 `3000`（API） / `3001`（metrics）
- `apps/web` — Next.js (App Router)，监听 `3000`（Dashboard，端口见 `apps/web/package.json`）
- `apps/ai-agent` — LangChain Worker，消费 `ai-diagnosis` / `ai-heal-fix` 队列
- `examples/nextjs-demo` — SDK 演练沙盘（端口 `3100`），测试场景按 Dashboard 菜单分组：**性能（Web Vitals 7 项） · 错误（同步/runtime/promise/白屏） · 接口（ajax 失败/业务码） · 资源（JS/图片/CSS/媒体/通用 404）**

### 5.2 单独启动某个应用

```bash
pnpm --filter @g-heal-claw/server dev
pnpm --filter @g-heal-claw/web dev
pnpm --filter @g-heal-claw/ai-agent dev
```

健康检查：

```bash
curl http://localhost:3000/healthz   # liveness
curl http://localhost:3000/readyz    # PG / Redis / Storage 可达性
```

---

## 6. 创建第一个项目

1. 浏览器打开 `http://localhost:3002`，注册首个管理员账号。
2. 登录后创建项目 `demo-web`，选择环境 `development`。
3. 项目创建成功后，Dashboard 会展示该项目的 **DSN**（形如 `http://<publicKey>@localhost:3000/<projectId>`）和 **secretKey**（用于 CLI 上传 Sourcemap）。
4. 复制 DSN 备用，下一节 SDK 需要。

---

## 7. SDK 接入你的前端应用

### 7.1 Web / H5

```html
<script type="module">
  import { init } from "https://cdn.example.com/@g-heal-claw/sdk@latest/dist/sdk.esm.js";

  init({
    dsn: "http://<publicKey>@localhost:3000/<projectId>",
    environment: "development",
    release: "v0.1.0",
    sampleRate: 1.0,
    beforeSend(event) {
      // 自定义脱敏 / 过滤
      return event;
    },
  });
</script>
```

开发期可直接从 workspace 引用：

```typescript
import { init } from "@g-heal-claw/sdk";

init({ dsn, environment: "development", release: "v0.1.0" });
```

初始化完成后，SDK 自动捕获：

- JS 运行时错误、Promise 未处理拒绝、静态资源加载失败
- Core Web Vitals（LCP / FCP / CLS / INP / TTFB） + navigation 各阶段耗时
- XHR / fetch 请求耗时与状态码
- 页面访问（PV / UV / session）与自定义 `track` 事件

### 7.2 验证上报

触发一个错误：

```typescript
setTimeout(() => {
  throw new Error("hello ghealclaw");
}, 0);
```

登录 Dashboard → **Errors** 页，几秒内应看到该 Issue 聚合出现。

### 7.3 埋点采集（trackPlugin · P0-3）

`trackPlugin` 一次性采集 4 类事件并驱动后台「埋点分析 → 事件分析」大盘：

```typescript
import { init, trackPlugin, track } from "@g-heal-claw/sdk";

init(
  { dsn, environment: "production", release: "v0.1.0" },
  {
    plugins: [
      trackPlugin({
        captureClick: true,     // data-track / data-track-id 点击（默认 true）
        captureSubmit: true,    // form 提交（默认 true）
        captureExpose: true,    // [data-track-expose] 曝光（默认 true）
        exposeDwellMs: 500,     // 曝光所需停留毫秒（默认 500）
        throttleMs: 1000,       // 同 selector 节流窗口（默认 1000）
      }),
    ],
  },
);
```

**4 类事件触发方式**：

| 类型 | DOM 标记 / 调用 | 触发条件 |
|---|---|---|
| `click` | `<el data-track-id="cta_primary">` 或 `<el data-track="...">` | 目标节点或祖先命中标记的点击 |
| `submit` | `<form ...>`（推荐加 `data-track-id`） | 任意 form 提交 |
| `expose` | `<el data-track-expose data-track-id="promo_hero">` | 元素进入视口 ≥ `exposeDwellMs`，<b>同节点仅一次</b> |
| `code` | `track(name, properties)` | 业务代码显式调用 |

**数据流**：`trackPlugin` → `/ingest/v1/events`（type='track'） → `track_events_raw` 表 → `/dashboard/v1/tracking/overview` → Web「事件分析」大盘。

**本地联调**：

1. 启动基础设施与应用：`docker compose up -d && pnpm dev`
2. 访问 demo 首页 `http://localhost:3002`，点击「埋点分析」分组任一场景：
   - `/tracking/click`、`/tracking/submit`、`/tracking/expose`、`/tracking/code` 四个专项场景
   - `/tracking/playground` 一页速查
3. DevTools → Network 观察 `/ingest/v1/events` 载荷中的 `trackType`
4. 访问 `http://localhost:3000/tracking/events` 查看聚合大盘

**Best Practice**：

- 事件名采用 `<domain>_<action>`（如 `checkout_submit` 而非 `clickButton1`）
- `data-track-*` 前缀的 dataset 自动进入 `properties`，业务字段统一通过这里暴露，避免手动转换
- `form` 内的 `input.value` 不会自动采集，敏感值请通过 `data-track-*` 主动脱敏后暴露

更多 API 细节见 [docs/sdk/tracking](/sdk/tracking)。

---

## 8. Sourcemap 上传（还原堆栈）

### 8.1 CLI 方式

```bash
pnpm add -D @g-heal-claw/cli

# 登录（写入 ~/.ghealclawrc）
npx ghealclaw login --dsn <DSN>

# 创建 release
npx ghealclaw release create --name v0.1.0

# 上传产物（含 .js 与 .map）
npx ghealclaw sourcemap upload \
  --release v0.1.0 \
  --dist ./dist \
  --url-prefix https://cdn.example.com/assets/
```

### 8.2 Vite 插件方式

`vite.config.ts`：

```typescript
import { defineConfig } from "vite";
import ghealclaw from "@g-heal-claw/vite-plugin";

export default defineConfig({
  plugins: [
    ghealclaw({
      dsn: process.env.GHC_DSN,
      release: process.env.GHC_RELEASE,
      urlPrefix: "https://cdn.example.com/assets/",
    }),
  ],
});
```

构建期自动调用 CLI 上传 Sourcemap，生产包不暴露 `.map` 文件。

---

## 9. 告警与通知渠道

> Phase 4 任务启用。此处给出目标形态。

1. Dashboard → **Settings → Notifications** 配置渠道（邮件 / 钉钉 / 企微 / Slack / Webhook / 短信）。
2. Dashboard → **Alerts → New Rule** 使用 DSL 配置触发条件：

```yaml
name: JS 错误率突增
scope:
  projectId: demo-web
  environment: production
metric: error_rate
window: 5m
operator: ">"
threshold: 0.05
cooldown: 10m
channels: [ops-dingtalk, frontend-email]
```

3. AlertModule 每分钟 Pull 式评估一次；触发后写 `alert_history` 并经 BullMQ `notifications` 队列分发。

---

## 10. AI 自愈 PR 工作流

> Phase 5 任务启用。此处给出目标流程。

1. **配置 AI Agent**：
   ```bash
   # .env
   ANTHROPIC_API_KEY=sk-ant-...
   AI_PRIMARY_MODEL=claude-opus-4-7
   AI_FALLBACK_MODEL=gpt-4o
   ```

2. **配置 Git 集成**：Dashboard → Settings → Git，填入 GitHub App 安装或 GitLab PAT，关联项目对应仓库。

3. **在项目根目录放置 `.ghealclaw.yml`**：
   ```yaml
   heal:
     maxLoc: 50
     paths:
       - src/**
       - apps/**/src/**
     forbidden:
       - src/legacy/**
       - "**/__snapshots__/**"
     verify:
       - pnpm lint
       - pnpm typecheck
       - pnpm test
     allowNetwork: false
   ```

4. **一键自愈**：在 Dashboard Issue 详情页点击「尝试自愈」，触发流程：
   ```
   HealModule 创建 heal_job (pending)
     ↓ BullMQ: ai-diagnosis
   apps/ai-agent 消费
     ├─ 加载 Issue + Sourcemap + 仓库上下文（LangChain Tools）
     ├─ ReAct 循环（readFile / grepRepo / writePatch / runSandbox）
     ├─ Docker 沙箱验证（默认 node:20-alpine，自动匹配 .nvmrc）
     └─ 通过后调用 GitHub API 创建 PR
   ```

5. **审阅 PR**：PR body 包含诊断 Markdown、堆栈证据、修复说明；人工 review 后合并。

安全边界见 `docs/DESIGN.md §8.3`（沙箱隔离、网络策略、LOC 上限）。

---

## 11. 常用命令

```bash
pnpm install              # 安装依赖
pnpm dev                  # Turbo 并行启动 apps + packages（含 SDK watch）
pnpm dev:demo             # 仅启动 nextjs-demo 及其依赖（SDK / shared 自动 watch 重建）
pnpm build                # 全量构建（依赖拓扑有序）
pnpm test                 # Vitest 单元 + 集成测试
pnpm typecheck            # 类型检查
pnpm lint                 # ESLint 全部
pnpm format               # Prettier 写入
pnpm format:check         # Prettier 检查（CI 用）
docker compose up -d      # 启动基础设施
docker compose down       # 停止基础设施
docker compose down -v    # 清理所有数据卷（慎用）
```

> **调试 SDK 时的注意事项**
>
> `examples/nextjs-demo` 通过 `@g-heal-claw/sdk` 的 `exports.main/module` 读取
> `packages/sdk/dist/sdk.esm.js`。只改 SDK 源码不触发构建时，demo 仍运行旧 bundle。
>
> 推荐使用 `pnpm dev:demo`（等价于 `turbo dev --filter=nextjs-demo...`）：
> turbo 会在 demo 启动前先 `^build` 一次 shared + SDK，然后并行跑三个 watcher：
> - `@g-heal-claw/shared` `tsc --build --watch`
> - `@g-heal-claw/sdk` `vite build --watch`
> - `nextjs-demo` `next dev`
>
> 改 SDK 源码保存后 Vite 会重写 `dist/`，Next.js Turbopack 会自动热重载。

---

## 12. 贡献指引

1. 阅读文档层级：**PRD（`docs/PRD.md`）→ SPEC（`docs/SPEC.md`）→ ARCHITECTURE（`docs/ARCHITECTURE.md`）→ DESIGN（`docs/DESIGN.md`）**。
2. 遵守 `AGENTS.md` 的编码规则与架构红线（AI 助手共用）。
3. 任务状态写入 `docs/tasks/CURRENT.md`；重要决策新增 `docs/decisions/NNNN-slug.md` ADR。
4. 提交前自检：`pnpm typecheck && pnpm lint && pnpm test`。
5. 禁止自动 `git commit` / `git push`，由维护者手动触发。
6. 使用 Claude Code 时可直接调用 `/feat <需求>` 驱动端到端交付流程（见 `.claude/skills/feat/SKILL.md`）。

---

## 13. 常见问题

### Docker 容器启动失败？

- 检查端口冲突：`lsof -i :5432 -i :6379 -i :9000`
- 重置数据卷：`docker compose down -v && docker compose up -d`

### SDK 上报 401 / 403？

- 确认 DSN 中 `publicKey` 与 Dashboard 显示一致
- 检查项目所在 `environment` 与 SDK 配置一致
- 查看 `apps/server` 日志 `GatewayModule` 的 `DsnGuard` 拒绝原因

### Sourcemap 未还原？

- 确认 CLI 上传时 `--release` 与 SDK `init({ release })` 完全一致
- 确认 `url-prefix` 与线上资源 URL 一致
- 查看 `apps/server` 日志 `SourcemapService.resolve` 的缓存命中情况

### AI Agent 超预算？

- 调低 `.ghealclaw.yml` 的 `heal.maxLoc`
- 使用 Claude Haiku 作为 fallback（成本更低）
- 在 Dashboard 设置月度 AI 调用上限

---

## 下一步

- **深入架构** — `docs/ARCHITECTURE.md`
- **接口契约** — `docs/SPEC.md`
- **设计理由** — `docs/DESIGN.md`
- **任务进度** — `docs/tasks/CURRENT.md`
- **使用 `/feat` 加速开发** — `.claude/skills/feat/SKILL.md`
