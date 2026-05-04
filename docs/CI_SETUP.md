# CI/CD 配置指南

## GitHub Actions CI

本项目使用 GitHub Actions 作为 CI 平台，配置文件位于 `.github/workflows/ci.yml`。

### CI 流程

CI 包含 3 个并行 job：

1. **lint-and-typecheck**：ESLint + TypeScript 类型检查
2. **test**：单元测试 + 集成测试（含 PostgreSQL 16 + Redis 7 服务）
3. **build**：全量构建验证

### 触发条件

- `push` 到 `main` 或 `dev` 分支
- 向 `main` 或 `dev` 分支提交 Pull Request

## Turbo Remote Cache 配置

Turbo Remote Cache 可显著加速 CI 构建（通过复用跨 CI 运行的缓存）。

### 前置条件

1. 在 [Vercel](https://vercel.com) 创建账号（或使用已有账号）
2. 创建或加入一个 Team

### 配置步骤

#### 1. 获取 Turbo Token

```bash
# 本地登录 Vercel（首次）
npx turbo login

# 链接当前仓库到 Vercel Team
npx turbo link
```

执行 `turbo link` 后会提示选择 Team 并生成 Remote Cache 配置。

#### 2. 在 GitHub 仓库设置 Secrets 和 Variables

进入 GitHub 仓库 → Settings → Secrets and variables → Actions：

**Secrets（加密）：**
- `TURBO_TOKEN`：从 Vercel Dashboard → Settings → Tokens 生成（Scope: Full Access）

**Variables（明文）：**
- `TURBO_TEAM`：你的 Vercel Team slug（如 `your-team-name`）

#### 3. 验证配置

提交代码触发 CI，查看 Actions 日志中是否出现：

```
Remote caching enabled
```

### 本地开发启用 Remote Cache

本地开发默认使用本地缓存，如需启用 Remote Cache：

```bash
# 登录（首次）
npx turbo login

# 链接仓库
npx turbo link

# 后续所有 turbo 命令自动使用 Remote Cache
pnpm build
pnpm lint
pnpm test
```

### 缓存命中率监控

访问 [Vercel Dashboard](https://vercel.com/dashboard) → 你的 Team → Turbo → Cache，查看：
- 缓存命中率
- 节省的构建时间
- 各任务的缓存使用情况

### 禁用 Remote Cache

如需临时禁用（如调试 CI）：

```bash
# 本地禁用
TURBO_REMOTE_ONLY=false pnpm build

# CI 中移除 TURBO_TOKEN 和 TURBO_TEAM 环境变量
```

## 常见问题

### Q: CI 报错 "Remote cache is disabled"

**A:** 检查 GitHub Secrets 中的 `TURBO_TOKEN` 和 Variables 中的 `TURBO_TEAM` 是否已正确配置。

### Q: 本地 `turbo link` 失败

**A:** 确保已执行 `npx turbo login` 并成功登录 Vercel。

### Q: 缓存未生效

**A:** 检查 `turbo.json` 中的 `outputs` 配置是否覆盖了所有构建产物目录。

### Q: 如何清理 Remote Cache？

**A:** Vercel 会自动清理 14 天未访问的缓存；手动清理需在 Vercel Dashboard 操作。

## 参考

- [Turbo Remote Cache 官方文档](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [Vercel Dashboard](https://vercel.com/dashboard)
