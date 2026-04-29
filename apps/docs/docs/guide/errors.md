# 异常分析

路径：监控中心 → **异常分析** `/monitor/errors`

## 页面构成

1. **分类卡片**：JS / Promise / Resource / HTTP 四类异常的总量与趋势
2. **趋势图**：按小时 / 天聚合的异常量堆叠图
3. **Ranking 表**：Top Issue 列表（按影响用户数倒序）
4. **Issue 详情**：单条 Issue 的堆栈、面包屑、用户列表

> 每张卡片 / 每列表格的字段定义见 [接口说明 · 异常分析指标](/reference/error-metrics)。

## 常见操作

### 查看原始堆栈

进入 Issue 详情页 → 「堆栈」Tab。若已上传 Sourcemap，会自动还原为源码行号。

### 按维度过滤

支持按 `browser` / `os` / `device` / `release` / `environment` / `userId` 过滤。点击维度 Tab 切换。

### 标记为「已解决」

Issue 详情右上角 → 「标记已解决」。下次再出现时会重新激活并告警。

### 创建告警规则

Issue 详情右上角 → 「创建告警」。支持：
- 新增事件 / 次数超阈值 / 用户数超阈值

## Sourcemap 未生效排查

| 症状 | 原因 | 解决 |
|---|---|---|
| 堆栈仍是压缩代码 | 未上传 Sourcemap | 见 [SDK · Sourcemap 上传](/sdk/sourcemap) |
| `release` 不匹配 | SDK 与上传时 release 不一致 | 检查 `init({ release })` 与上传参数 |
| 文件找不到 | 源路径映射错误 | 检查 `sourceMappingURL` 注释是否指向公共可访问地址 |
