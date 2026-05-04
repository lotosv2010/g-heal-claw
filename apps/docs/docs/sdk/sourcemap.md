# Sourcemap 上传

线上代码一般是压缩混淆的。上传 Sourcemap 后，Dashboard 能把异常堆栈还原为源码行号。

## 前置条件

1. 构建时生成 Sourcemap（默认大多数构建工具都支持）
2. 拿到项目的 `secretKey`（在 Dashboard 系统设置 → 项目管理）
3. SDK `init({ release: "1.2.3" })` 已设置 release，与上传时一致

## 使用 HTTP API 上传

Sourcemap 服务提供 REST API，可直接用 `curl` 或在 CI 中调用。

### 步骤 1：创建 Release

```bash
curl -X POST http://localhost:3001/sourcemap/v1/releases \
  -H "X-Api-Key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": "1.2.3"}'
```

### 步骤 2：上传 .map 文件

```bash
RELEASE_ID="rel_xxx"  # 从步骤 1 返回

# 对每个 .map 文件上传
curl -X POST "http://localhost:3001/sourcemap/v1/releases/$RELEASE_ID/artifacts" \
  -H "X-Api-Key: $SECRET_KEY" \
  -F "filename=assets/main.abc123.js" \
  -F "file=@dist/assets/main.abc123.js.map"
```

### 步骤 3（可选）：验证上传

```bash
curl "http://localhost:3001/sourcemap/v1/releases/$RELEASE_ID/artifacts" \
  -H "X-Api-Key: $SECRET_KEY"
```

## 使用 CLI 上传（计划中）

> CLI 工具 `@g-heal-claw/cli` 正在开发中（T1.5.5），将提供一键递归上传：

```bash
pnpm add -D @g-heal-claw/cli

npx ghc sourcemap upload \
  --gateway https://ingest.your-domain.com \
  --project my-app-web \
  --release 1.2.3 \
  --dir ./dist \
  --secret-key $GHC_SECRET_KEY
```

参数：

| 参数 | 说明 |
|---|---|
| `--gateway` | Gateway 地址 |
| `--project` | 项目标识 |
| `--release` | 必须与 SDK `init({ release })` 一致 |
| `--dir` | 构建产物目录，CLI 递归找 `.map` |
| `--secret-key` | 仅此命令需要；**禁止暴露到浏览器** |

## CI 集成示例

GitHub Actions：

```yaml
- name: Upload sourcemap
  run: |
    # 步骤 1：创建 release
    RELEASE_RESP=$(curl -s -X POST "${{ secrets.GHC_GATEWAY }}/sourcemap/v1/releases" \
      -H "X-Api-Key: ${{ secrets.GHC_SECRET_KEY }}" \
      -H "Content-Type: application/json" \
      -d '{"version": "${{ github.sha }}"}')
    RELEASE_ID=$(echo $RELEASE_RESP | jq -r '.data.id')

    # 步骤 2：递归上传所有 .map 文件
    find ./dist -name '*.map' | while read mapfile; do
      jsfile="${mapfile%.map}"
      filename=$(basename "$jsfile")
      curl -s -X POST "${{ secrets.GHC_GATEWAY }}/sourcemap/v1/releases/$RELEASE_ID/artifacts" \
        -H "X-Api-Key: ${{ secrets.GHC_SECRET_KEY }}" \
        -F "filename=$filename" \
        -F "file=@$mapfile"
    done
```

## 上传后清理

**强烈建议** 上传后删除产物中的 `.map` 文件，避免 Sourcemap 暴露到公网：

```bash
find ./dist -name '*.map' -delete
```

## 还原原理

1. SDK 上报事件时携带 `release` 字段
2. ErrorProcessor 消费事件，调用 `SourcemapService.resolveFrames()`
3. 按 `(projectId, release, filename)` 查询对应 .map 文件
4. 使用 `source-map@^0.7`（WASM 加速）逐帧还原源码位置
5. LRU 缓存已解析的 `SourceMapConsumer`（容量 100，TTL 1h）
6. 任何环节失败 → 原样返回该帧，不影响事件入库

## 排查

| 症状 | 检查项 |
|---|---|
| 堆栈仍未还原 | 确认 release 有记录：`GET /sourcemap/v1/releases/:id/artifacts` |
| `release not found` | SDK `init({ release })` 与上传时 `version` 不一致 |
| 文件找不到 | 上传的 `filename` 需与堆栈帧中的文件路径匹配 |
| 部分帧未还原 | 对应 .map 文件未上传，或 mapping 不覆盖该行列 |

## 相关

- [后端 API 参考](/reference/sourcemap) — 4 个端点完整说明
- ADR-0031 — Sourcemap 服务架构决策
