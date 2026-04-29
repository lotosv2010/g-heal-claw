# Sourcemap 上传

线上代码一般是压缩混淆的。上传 Sourcemap 后，Dashboard 能把异常堆栈还原为源码行号。

## 前置条件

1. 构建时生成 Sourcemap（默认大多数构建工具都支持）
2. 拿到项目的 `secretKey`（在 Dashboard 系统设置 → 项目管理）
3. SDK `init({ release: "1.2.3" })` 已设置 release，与上传时一致

## 使用 CLI 上传

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
    npx ghc sourcemap upload \
      --gateway ${{ secrets.GHC_GATEWAY }} \
      --project my-app-web \
      --release ${{ github.sha }} \
      --dir ./dist \
      --secret-key ${{ secrets.GHC_SECRET_KEY }}
```

## 上传后清理

**强烈建议** 上传后删除产物中的 `.map` 文件，避免 Sourcemap 暴露到公网：

```bash
find ./dist -name '*.map' -delete
```

## 排查

| 症状 | 检查项 |
|---|---|
| 堆栈仍未还原 | Dashboard → 系统设置 → Sourcemap，确认此 release 有记录 |
| `release not found` | SDK 与上传时 `release` 不一致 |
| 文件找不到 | `sourceMappingURL` 注释与上传时路径不匹配 |
