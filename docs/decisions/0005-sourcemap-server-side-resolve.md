# ADR-0005: Sourcemap 服务端还原（非客户端）

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-25 |
| 决策人 | @gaowenbin |

## 背景

生产环境中 JavaScript 经过压缩混淆，错误堆栈中的文件名、行号、列号指向 bundle 产物而非源码。需要通过 Sourcemap 还原原始堆栈，帮助开发者快速定位问题。

还原有两个时机选择：
- **客户端还原**：SDK 侧加载 .map 文件并还原后上报
- **服务端还原**：SDK 上报原始堆栈，服务端异步还原

## 决策

采用 **服务端还原** 方案：

1. SDK 上报压缩后的原始堆栈帧（file/line/column）
2. 用户通过 API 上传 Sourcemap 文件到 MinIO（S3 兼容存储）
3. ErrorProcessor 消费时调用 `SourcemapService.resolveFrames()` 逐帧还原
4. 使用 `source-map@0.7`（WASM）+ LRU Cache 避免重复加载

## 备选方案

| 方案 | 评估 |
|---|---|
| **客户端还原** | .map 文件暴露源码（安全风险）；SDK 体积暴增（source-map 库 ~100KB）；用户网络加载 .map 文件增加延迟 |
| **上报时实时还原（Gateway 同步）** | 阻塞 ingest 响应；.map 加载 IO 影响吞吐 |
| **不还原，前端展示时 lazy 还原** | 每次查看详情都重新解析，响应慢；不支持聚合（指纹基于还原后堆栈更准确） |

## 影响

- **收益**：SDK 零体积增加；源码不暴露给客户端；还原结果持久化（一次还原，多次查看）
- **成本**：需要用户上传 .map 文件（CI 集成或手动）；服务端存储成本
- **缓解**：保留最近 3 个 release 的 .map；单文件 50MB 上限；LRU 100 条缓存

## 后续

- 实现见 ADR-0031（SourcemapService + S3StorageService + ApiKeyGuard）
- 上传入口：HTTP API `POST /sourcemap/v1/releases/:id/artifacts` + Web UI `/settings/sourcemaps`
