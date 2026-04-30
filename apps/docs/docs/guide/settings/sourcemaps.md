# Source Map

路径：系统设置 → **Source Map** `/settings/sourcemaps`

> 状态：建设中（Phase 1 交付）

## 能力规划

管理已上传的 Source Map 清单，用于 Issue 详情页的堆栈源码还原。

### 上传方式

CLI 在构建产物后上传：

```bash
npx @g-heal-claw/cli sourcemap upload \
  --secret-key $GHC_SECRET_KEY \
  --release v1.2.3 \
  ./dist
```

详见 [SDK · Sourcemap 上传](/sdk/sourcemap)。

### 列表字段

| 列 | 说明 |
|---|---|
| release | 版本号（与 SDK `init({ release })` 对齐） |
| 上传时间 | UTC |
| 文件数 | 本次上传的 `.map` 文件数 |
| 大小 | 累计体积 |
| 操作 | 查看文件清单 / 删除 |

### 回溯与 GC

- 默认保留最近 30 个 release，超出自动清理
- 「删除」仅标记回收，24h 内可通过审计恢复

## 堆栈还原失败

请参考 [SDK · Sourcemap 上传 · 排查](/sdk/sourcemap#排查) 逐项核对。
