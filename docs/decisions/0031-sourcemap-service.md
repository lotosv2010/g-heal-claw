# ADR-0031: Sourcemap 服务实装（M1.5 T1.5.1~T1.5.4 · Release API + MinIO + source-map v0.7 还原）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-05-04 |
| 决策人 | @Robin |

## 背景

ADR-0005 已决定"Sourcemap 服务端还原（非客户端）"，ADR-0026 建立了 `SourcemapService.resolveFrames` stub + ErrorProcessor BullMQ 链路。当前 stub 原样返回事件，线上异常堆栈全是压缩后的混淆代码。

需求：把 `resolveFrames` 从 stub 替换为真实实现，让异常监控能展示源码级堆栈。

已就绪基础设施：
- `releases` 表已存在（ADR-0017 §3.6），含 `(project_id, version)` 唯一约束
- MinIO 环境变量已在 `BaseEnvSchema` 定义（9 个 `MINIO_*` key），docker compose 已含 MinIO 服务
- `ErrorProcessor` 已调用 `sourcemap.resolveFrames(events)`，接口契约锁定
- SPEC §5.2 已定义 4 个 HTTP 端点
- DESIGN §9.4 已规划 `StorageService` 抽象（`put / get / delete / presignGet / presignPut`）
- DESIGN §9.5 已规划缓存 key `sourcemap:release:<projectId>:<release>` TTL 1h

约束：
- `resolveFrames` 契约不变：`readonly ErrorEvent[]` → `readonly ErrorEvent[]`，永不抛错
- 上传鉴权用 API Token / secretKey（SPEC §11），非 JWT
- SDK 零变更（`release` 字段已在 init options 中）
- CLI（T1.5.5）和 Vite 插件（T1.5.6）本次不实现，推迟为独立切片
- `sourcemap-warmup` 预热队列首版不引入（YAGNI）

## 决策

### 1. 范围边界

本切片实装 T1.5.1 ~ T1.5.4（Release HTTP API + MinIO Storage + source-map 还原 + ErrorProcessor 接入），**推迟** T1.5.5 CLI 和 T1.5.6 Vite 插件。

### 2. 数据模型

#### 2.1 `release_artifacts` 新表

```sql
CREATE TABLE release_artifacts (
  id            VARCHAR(32) PRIMARY KEY,            -- art_xxx
  release_id    VARCHAR(32) NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  project_id    VARCHAR(32) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename      VARCHAR(512) NOT NULL,              -- 原始 JS 文件名（如 assets/main.abc123.js）
  map_filename  VARCHAR(512) NOT NULL,              -- .map 文件名
  storage_key   VARCHAR(1024) NOT NULL,             -- MinIO 对象 key
  file_size     INTEGER NOT NULL,                   -- .map 文件字节数
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, filename)                     -- 同 release 下不重复上传同一文件
);
CREATE INDEX idx_artifacts_project_release ON release_artifacts(project_id, release_id);
```

**查询路径**：`resolveFrames` 需要 `(projectId, release, filename)` → `storage_key`：
```sql
SELECT storage_key FROM release_artifacts ra
  JOIN releases r ON r.id = ra.release_id
  WHERE r.project_id = $1 AND r.version = $2 AND ra.filename = $3
```

#### 2.2 MinIO 对象 Key 结构

```
sourcemaps/<projectId>/<releaseVersion>/<filename>.map
```

示例：`sourcemaps/proj_abc/1.2.3/assets/main.abc123.js.map`

### 3. HTTP API（SPEC §5.2 对齐）

#### 3.1 创建 Release

```
POST /sourcemap/v1/releases
Header: X-Api-Key: <secretKey>
Body: { "projectId": "proj_xxx", "version": "1.2.3", "commitSha?": "abc123" }
Response 201: { "data": { "id": "rel_xxx", "version": "1.2.3" } }
```

幂等：`(project_id, version)` 已存在时返回 200 + 现有 release。

#### 3.2 上传 Artifact（multipart）

```
POST /sourcemap/v1/releases/:releaseId/artifacts
Header: X-Api-Key: <secretKey>
Content-Type: multipart/form-data
  field "file": .map 文件内容（单文件）
  field "filename": 原始 JS 文件名（assets/main.abc123.js）
Response 201: { "data": { "id": "art_xxx", "filename": "...", "fileSize": 12345 } }
```

限制：
- 单文件 ≤ 50MB（Zod + Fastify bodyLimit）
- 仅接受 `.map` 后缀或 `application/json` content type
- 同 `(release_id, filename)` 重复上传 → 覆盖旧对象 + 更新元数据行

#### 3.3 列出 Artifacts

```
GET /sourcemap/v1/releases/:releaseId/artifacts
Header: X-Api-Key: <secretKey>
Response 200: { "data": [{ id, filename, mapFilename, fileSize, createdAt }] }
```

#### 3.4 删除 Release

```
DELETE /sourcemap/v1/releases/:releaseId
Header: X-Api-Key: <secretKey>
Response 204
```

级联：删 release → 级联删 release_artifacts 行 + 批量删 MinIO 对象。

### 4. StorageService 抽象层

`apps/server/src/modules/sourcemap/storage.service.ts`：

```typescript
interface StorageService {
  put(key: string, body: Buffer | Readable, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}
```

实现：`S3StorageService`（`@aws-sdk/client-s3`），注入 `BaseEnv` 的 `MINIO_*` 配置。

- `onModuleInit` 确保 bucket 存在（`HeadBucket` + `CreateBucket`）
- NODE_ENV=test 时跳过 S3 连接（同 RealtimeService 模式）

### 5. resolveFrames 真实实现

`SourcemapService.resolveFrames(events)`：

```
对每个 event:
  1. 跳过无 frames 或无 release 的事件
  2. 对每个 frame:
     a. 从 LRU cache 查 SourceMapConsumer（key = projectId:release:filename）
     b. cache miss → 查 release_artifacts 表 → get from MinIO → new SourceMapConsumer
     c. consumer.originalPositionFor({ line, column }) → { source, line, column, name }
     d. 替换 frame.file / frame.line / frame.column / frame.function
  3. 返回 event 的浅拷贝（frames 被替换）
```

**LRU 缓存**：
- 使用 `lru-cache`（npm）或简单 `Map` + 容量限制
- 容量：`SOURCEMAP_LRU_CAPACITY`（默认 100 条 consumer，约占 200MB 内存上限）
- TTL：1h（对齐 DESIGN §9.5 `sourcemap:release:<projectId>:<release>`）
- Consumer 销毁：LRU evict 时调用 `consumer.destroy()` 释放 WASM 内存

**source-map 库选型**：`source-map@^0.7`（Mozilla 官方，WASM 加速，支持 VLQ mapping decode）

**降级策略**：
- artifact 不存在 → 原样返回该 frame（debug 日志）
- MinIO 读取失败 → 原样返回该 frame（warn 日志）
- SourceMapConsumer 解析失败 → 原样返回该 frame（warn 日志）
- 单个 frame 失败不影响同事件其他 frame / 同批次其他事件

### 6. 指纹影响

当前指纹规则：`sha1(subType + normalizedMessage + topFrame.file + topFrame.function)`

Sourcemap 还原后 `topFrame.file` 从 `https://cdn.example.com/assets/main.abc123.js` 变为 `src/utils/parser.ts`，`topFrame.function` 从 `n` 变为 `parseInput`。**这意味着同一个 bug 还原前后指纹不同**。

处理策略：
- **可接受**：还原前的压缩指纹本身就不准确（同一 bug 不同构建产生不同 hash），还原后指纹才是正确的
- 上传 Sourcemap 后新到的事件使用正确指纹，旧 issue 中的事件仍保留旧指纹
- 不做回溯修正（成本大、收益低）
- 在 Dashboard 异常列表做提示："此 Issue 部分事件堆栈未还原"（推迟到 UI 增量）

### 7. 鉴权

首版使用 `X-Api-Key` header + `project_keys.secret_key` 校验：
- 查 `project_keys` 表 `WHERE secret_key = $1 AND is_active = true`
- 匹配到 → 取 `project_id`，校验与 URL/body 中的 project 一致
- 不匹配 → 401

`ApiKeyGuard` 作为 NestJS Guard 挂在 SourcemapController 上，复用 `project_keys` 表（已存在于 ADR-0017 schema）。

### 8. 目录落位

```
apps/server/src/modules/sourcemap/
  ├── sourcemap.module.ts        （扩展）
  ├── sourcemap.service.ts       （resolveFrames 真实实现）
  ├── sourcemap.controller.ts    （新增：Release + Artifact CRUD）
  ├── storage.service.ts         （新增：S3/MinIO 封装）
  ├── api-key.guard.ts           （新增：X-Api-Key 鉴权）
  └── dto/
      ├── create-release.dto.ts
      ├── upload-artifact.dto.ts
      └── release-artifact.dto.ts

apps/server/src/shared/database/schema/
  └── release-artifacts.ts       （新增：Drizzle schema）

apps/server/drizzle/
  └── 0009_release_artifacts.sql （新增：迁移）
```

## 备选方案

### A. 直接在 SourcemapService 中调用 `@aws-sdk/client-s3`（不抽象 StorageService）
- **不选**：DESIGN §9.4 明确要求 StorageService 抽象，后续需支持阿里 OSS 等；单元测试也需要 mock 存储层

### B. 用 Redis 缓存 .map 文件内容（替代 LRU in-memory）
- **不选**：.map 文件通常 1~10MB，Redis 单 key 存大 blob 不合适；in-process LRU 缓存 SourceMapConsumer 对象（已解析的 WASM instance）比缓存原始文件更高效

### C. 首版同时交付 CLI + Vite 插件
- **推迟**：CLI/Vite 插件属于开发者工具链，对线上还原不阻塞；首版用 curl + multipart form 或 demo 脚本验证即可

### D. 引入 sourcemap-warmup BullMQ 队列
- **推迟**：YAGNI。LRU 冷启动首次请求稍慢但正确，热路径后续请求命中缓存。实际流量下 ErrorProcessor 批量处理同 release 事件，首次 miss 后同批次后续 frame 都命中

## 影响

### 收益
- 异常监控从"能看到压缩堆栈"升级为"能定位源码行号"，核心功能闭环
- `StorageService` 抽象为后续对象存储需求（heal artifacts、event archive）奠定基础
- `ApiKeyGuard` 为后续 CLI / CI 工具链鉴权提供复用组件

### 成本
- 新增 `@aws-sdk/client-s3`（~300KB gzip）+ `source-map@^0.7`（~50KB gzip，含 WASM）到 server 依赖
- 新增 `release_artifacts` 表 + 迁移 0009
- 新增约 800 行后端代码（StorageService ~100、SourcemapService 扩展 ~200、Controller ~200、Guard ~50、DTO ~80、schema ~30、迁移 ~30、测试 ~200）
- LRU 缓存最大内存占用 ~200MB（100 条 consumer × ~2MB/条 平均）

### 风险
- **source-map WASM 初始化**：首次加载 WASM binary 需 ~50ms，后续复用 → 首个 batch 稍慢；可接受
- **大型 .map 文件（>10MB）解析慢**：`SourceMapConsumer` 解析 10MB map 约 200ms → ErrorProcessor concurrency=4 可并行分摊；单文件 50MB 上限控制极端情况
- **MinIO 不可用**：resolveFrames 降级为原样返回，不影响事件入库（已有契约保证）
- **指纹漂移**：上传 Sourcemap 后新旧事件指纹不同 → 产生新 Issue → 可接受（旧指纹本身不准确）

## 后续

- 任务：`T1.5.1` ~ `T1.5.4` 全部完成 ✅ 2026-05-04
- Demo 脚本：`examples/nextjs-demo/scripts/upload-sourcemap.sh`（curl 三步示例：创建 release → 上传 .map → 列出 artifacts）
- SDK 使用说明：`apps/docs/docs/sdk/sourcemap.md`（HTTP API + CLI 计划 + CI 示例 + 还原原理 + 排查表）
- 后端 API 参考：`apps/docs/docs/reference/sourcemap.md`（4 端点完整说明 + 鉴权 + 还原流程 + 错误码）
- ARCHITECTURE §4.1.2 已从"stub"切换为"已实现"
- SPEC §9.2 `release_artifacts` 标记"已建表"
- 后续增量切片（推迟）：
  - T1.5.5 `@g-heal-claw/cli` sourcemap upload 命令
  - T1.5.6 `@g-heal-claw/vite-plugin` 构建期上传钩子
  - `sourcemap-warmup` BullMQ 预热队列（按需）
  - Dashboard Sourcemap 管理页面（`/settings/sourcemaps`，依赖 T1.1.7 RBAC）
  - 指纹回溯修正工具（按需）
