# Sourcemap API 参考

后端 Sourcemap 服务提供 Release 管理与 Artifact（.map 文件）上传/查询/删除 API。

## 鉴权

所有端点使用 `X-Api-Key` header 鉴权，值为项目的 `secretKey`（在 Dashboard 系统设置 → 项目管理中获取）。

```
X-Api-Key: sk_xxxxxxxxxxxxxxxx
```

## 端点

### POST /sourcemap/v1/releases

创建 Release（幂等：`(projectId, version)` 已存在时返回现有记录）。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | string | 是 | 语义版本号，需与 SDK `init({ release })` 一致 |
| `commitSha` | string | 否 | Git commit SHA（最长 40 字符） |
| `notes` | string | 否 | 发版备注 |

**响应 201：**

```json
{
  "data": {
    "id": "rel_xxx",
    "projectId": "proj_xxx",
    "version": "1.2.3",
    "commitSha": "abc123",
    "createdAt": "2026-05-04T00:00:00.000Z"
  }
}
```

### POST /sourcemap/v1/releases/:releaseId/artifacts

上传 Sourcemap artifact（multipart/form-data）。

**Form 字段：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `filename` | string | 是 | 原始 JS 文件名（如 `assets/main.abc123.js`） |
| `file` | binary | 是 | .map 文件内容（单文件 ≤ 50MB） |

同一 `(releaseId, filename)` 重复上传会覆盖旧记录。

**响应 201：**

```json
{
  "data": {
    "id": "art_xxx",
    "filename": "assets/main.abc123.js",
    "mapFilename": "assets/main.abc123.js.map",
    "fileSize": 12345,
    "createdAt": "2026-05-04T00:00:00.000Z"
  }
}
```

### GET /sourcemap/v1/releases/:releaseId/artifacts

列出 Release 下所有 Artifacts。

**响应 200：**

```json
{
  "data": [
    {
      "id": "art_xxx",
      "filename": "assets/main.js",
      "mapFilename": "assets/main.js.map",
      "fileSize": 12345,
      "createdAt": "2026-05-04T00:00:00.000Z"
    }
  ]
}
```

### DELETE /sourcemap/v1/releases/:releaseId

删除 Release 及其所有 Artifacts（级联删除 DB 记录 + MinIO 对象）。

**响应 204：** 无响应体。

## 堆栈还原流程

1. SDK 上报异常事件时携带 `release` 字段（如 `"1.2.3"`）
2. ErrorProcessor 消费事件，调用 `SourcemapService.resolveFrames()`
3. Service 按 `(projectId, release, filename)` 查询 `release_artifacts` 表获取 `storage_key`
4. 从 MinIO 读取 .map 文件，使用 `source-map@^0.7`（WASM 加速）解析
5. 逐帧调用 `originalPositionFor({ line, column })` 还原源码位置
6. LRU 缓存 `SourceMapConsumer` 实例（容量 100，TTL 1h，evict 时调 `.destroy()`）
7. 任何环节失败 → 原样返回该帧，不影响事件入库

## 错误码

| HTTP | 错误码 | 说明 |
|---|---|---|
| 401 | `MISSING_API_KEY` | X-Api-Key header 缺失 |
| 401 | `INVALID_API_KEY` | API Key 无效或已禁用 |
| 400 | `VALIDATION_FAILED` | 请求体/参数校验失败 |
| 404 | `RELEASE_NOT_FOUND` | Release 不存在或无权访问 |

## 相关

- [SDK Sourcemap 上传指南](/sdk/sourcemap) — CLI + CI 集成
- [ADR-0031](https://github.com/user/repo/blob/main/docs/decisions/0031-sourcemap-service.md) — 架构决策
