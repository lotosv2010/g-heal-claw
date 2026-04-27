# ADR-0011: apps/server 骨架（NestJS + Fastify + Gateway 收端）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-27 |
| 决策人 | @gaowenbin |

## 背景

T1.2.1（SDK 骨架 + examples/nextjs-demo）已落地，demo 页点击按钮会向
`http://localhost:3001/ingest/v1/events` 发 POST。但 `apps/server` 尚未初始化，请求
落到了 demo 自身（端口已恢复 3100）之外的虚空，Network 显示 ECONNREFUSED。

为把端到端链路打通，需要 **T1.1.3 apps/server 初始化**。当前目标仅是"骨架"：
让 SDK 发出的 POST 能被真实接收、通过 Zod 校验、返回 2xx，**不**引入队列 / 数据库 /
鉴权 / 限流 / Sourcemap（那些属于 T1.1.5 / T1.3.x）。

约束：

- ARCHITECTURE 要求 `apps/server` 为 NestJS + Fastify adapter（不是 Express）
- 环境变量必须通过 `packages/shared` 已有的 `ServerEnvSchema` + `parseEnv` 校验
- IngestRequest 形状必须消费 `packages/shared` 的 `IngestRequestSchema`，不得重复定义
- 模块边界：`GatewayModule` 只负责 **接收 / 校验 / 日志**；骨架阶段不入队不落库
- `examples/nextjs-demo` 在 `localhost:3100`，需要 CORS 放开
- 骨架阶段禁止任何 BullMQ / PostgreSQL / Redis 真实连接——`SharedModule` 留注入点，不启动连接

## 决策

**1. 技术栈**：NestJS 10 + Fastify adapter；Zod 校验用自研轻量 `ZodValidationPipe`（不引
`nestjs-zod`，避免再绑一层依赖、减少升级摩擦）。

**2. 目录结构**

```
apps/server/
├── src/
│   ├── main.ts                     # bootstrap: 读 env → 建 Fastify → listen
│   ├── app.module.ts               # 根模块，聚合 Gateway + Shared
│   ├── config/
│   │   ├── config.module.ts        # 全局 @Global() 模块，提供 ServerEnv token
│   │   └── env.ts                  # 读取 process.env + 委托 shared.parseEnv
│   ├── gateway/
│   │   ├── gateway.module.ts
│   │   ├── gateway.controller.ts   # POST /ingest/v1/events
│   │   ├── gateway.service.ts      # 骨架仅打日志 + 返回 { accepted }
│   │   └── ingest.dto.ts           # 重新导出 shared 的 IngestRequestSchema（便于 Swagger 注解）
│   ├── shared/
│   │   ├── shared.module.ts        # @Global()，现阶段仅提供 Logger；DB/Redis/BullMQ 注入点留空
│   │   └── pipes/
│   │       └── zod-validation.pipe.ts
│   └── health/
│       ├── health.module.ts
│       └── health.controller.ts    # GET /healthz → { status: "ok" }
├── test/
│   └── gateway.e2e-spec.ts         # 通过 Nest Testing + FastifyAdapter 做 HTTP 级别测试
├── Dockerfile                      # 占位，生产镜像构建留给 Phase 1 末尾
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── README.md
```

**3. 公开 HTTP 契约（T1.1.3 交付范围）**

| Method | Path | 入参 | 出参 | 说明 |
|---|---|---|---|---|
| POST | `/ingest/v1/events` | `IngestRequestSchema` | `{ accepted: number }` | 骨架：仅 Zod 校验 + 日志；未来 T1.3.x 会改为入队 |
| GET | `/healthz` | — | `{ status: "ok" }` | K8s liveness；不校验 env 以外的依赖 |
| GET | `/docs` | — | HTML | Swagger UI；CORS 仅 dev 开放 |

骨架阶段**不**实现：`/sourcemap/upload`、`/open/v1/metrics/*`、WebSocket/SSE。

**4. 环境变量加载**

- `main.ts` 中通过 `dotenv-flow`（优先级：`.env.local` > `.env.<NODE_ENV>` > `.env`）加载到 `process.env`
- 再调用 `parseEnv(ServerEnvSchema, process.env)` 得到强类型 `ServerEnv`
- 通过 `ConfigModule` 以 `SERVER_ENV` DI token 注入各模块
- 校验失败直接 `process.exit(1)`，并打印 `EnvValidationError` 的每行字段错误

**5. CORS 策略**

骨架阶段：`origin: [PUBLIC_WEB_BASE_URL, "http://localhost:3100"]`，`credentials: true`，
`methods: ["GET","POST","OPTIONS"]`。生产策略留给 T1.3.1（含 DSN publicKey 校验）。

**6. Zod 校验管道**

```ts
// shared/pipes/zod-validation.pipe.ts（伪代码）
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodTypeAny) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException(r.error.issues);
    return r.data;
  }
}
```

Controller 写法：
```ts
@Post()
@UsePipes(new ZodValidationPipe(IngestRequestSchema))
ingest(@Body() body: IngestRequest) { ... }
```

**7. 测试策略**

- 单元：`GatewayService` 纯逻辑（本次基本没逻辑，仅日志打印计数）
- e2e：`supertest` + `FastifyAdapter` 跑起完整 app，验证：
  1. 合法 payload → 200 + `{ accepted: N }`
  2. 非法 payload（缺 events / 类型错）→ 400 + issues
  3. `OPTIONS /ingest/v1/events` from `http://localhost:3100` → CORS 头正确
  4. `GET /healthz` → 200

## 备选方案

**备选 A：**Express adapter（NestJS 默认）。**放弃原因**：coding.md 明确要求 Fastify。

**备选 B：**nestjs-zod 库。**放弃原因**：多一层抽象依赖；我们的 Schema 在 `packages/shared`
已定义，自研 Pipe 20 行代码即可完成，后续升级可控。

**备选 C：**骨架即打通 BullMQ 入队。**放弃原因**：BullMQ 依赖 Redis 真实连接 + 队列
注册 + Worker 基建，远超"让 demo Network 见到 2xx"的骨架目标；引入后一旦 Redis 未起
本地 `pnpm dev` 直接失败，开发体验差。留给 T1.3.2。

**备选 D：**用 `@nestjs/config` 的 `ConfigModule.forRoot({ validationSchema })`
代替 `parseEnv`。**放弃原因**：它依赖 Joi 或 class-validator，与我们的 Zod 统一策略
不符；且 `packages/shared` 的 `parseEnv` 已经做了更友好的多行错误输出，重复建设。

## 影响

**正向：**
- 端到端链路打通：SDK → Gateway → 200 响应，demo 验收标准达成
- 模块边界明确：`GatewayModule` 就是将来 T1.3.x 插 BullMQ 的唯一入口
- Zod 校验器复用到 server 侧，契约双端一致（SPEC §5.1）

**成本：**
- 新增约 15 个文件，约 400 LOC（含测试）
- 新增运行时依赖：`@nestjs/core`、`@nestjs/common`、`@nestjs/platform-fastify`、
  `@nestjs/swagger`、`fastify`、`@fastify/cors`、`dotenv-flow`、`reflect-metadata`、`rxjs`
- 开发依赖：`@nestjs/testing`、`@nestjs/cli`、`supertest`、`ts-node`

**风险：**
- NestJS 10 + Fastify 4 有极少量 adapter 兼容性坑（CORS hook 时机等）——通过 e2e 测试兜底
- 当前 `ServerEnvSchema` 要求了 SMTP / GEOIP 等完整变量，启动前必须 `cp .env.example .env`；
  这是 **有意为之**，避免生产缺配置静默降级

## 后续

- T1.1.5 Drizzle Schema + 迁移 → `SharedModule` 补充 DatabaseProvider
- T1.3.1 GatewayGuard（publicKey 校验）+ Rate Limit（@fastify/rate-limit）
- T1.3.2 把 Gateway 的日志写入改为 BullMQ `events-*` 队列
- T1.1.3 拆子任务：T1.1.3.1 ~ T1.1.3.9（见 CURRENT.md）
