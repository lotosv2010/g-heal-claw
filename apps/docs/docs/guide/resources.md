# 静态资源

路径：监控中心 → **静态资源** `/monitor/resources`

## 采集内容

SDK 的 `resourcePlugin` 基于 `PerformanceObserver('resource')` 采集浏览器全量静态资源样本，上报：

- URL / Host / initiatorType
- 分类（六类固定：script / stylesheet / image / font / media / other）
- 耗时 duration / 传输字节 transferSize
- 失败标记 failed / 缓存命中 cache / 慢资源 slow

> fetch / XHR / beacon 请求**不**在此大盘，见 [API 监控](/guide/api)。

## 页面构成

1. **Summary 卡片**：
   - 资源请求数（含环比 %）
   - 失败请求数（含失败率环比百分点差）
   - 慢资源数
   - p75 耗时（ms）
   - 传输字节（自动 B → KB → MB → GB）
2. **分类桶**：6 个固定分类的 count / 失败 · 慢 / 平均耗时
3. **趋势图**：样本数三曲线（total / failed / slow）+ 均耗时单曲线（Segmented 切换）
4. **Top 慢资源表**：按 p75 倒序，展示类型 / Host / URL / 样本数 / p75 / 失败率
5. **Top 失败 Host 表**：按失败次数倒序，展示 Host / 总样本 / 失败数 / 失败率

## 常见操作

### 定位慢资源

「Top 慢资源表」→ 按类型（script / image / font 等）筛选 → 对接 CDN 策略优化。

### 发现失败 Host

「Top 失败 Host 表」能快速暴露被墙 / 证书过期 / 404 的第三方资源 Host。

### 区分缓存命中

趋势图的「样本数」曲线分 total / failed / slow，命中缓存的样本进入 total 但不计入 failed/slow；需配合指标字典理解口径。

## 与其他大盘的边界

| 现象 | 去哪里看 |
|---|---|
| fetch / XHR 响应 4xx / 5xx | [API 监控](/guide/api) |
| `<img>` / `<script>` 返回 404 | [异常分析](/guide/errors)（DOM 加载异常事件流） |
| 图片 / 字体 / 视频下载慢 | 本页面 |
| 某个 CDN Host 整体失败率上升 | 本页面「Top 失败 Host」 |

## 联调提示

在 `examples/nextjs-demo` 中可直接触发：

- `/resources/slow-script` —— 动态注入带延迟的 `<script>`，驱动「Top 慢资源」
- `/resources/image-gallery` —— 批量加载随机图片，驱动 image 分桶与 Top 失败 Host

触发后等待 2 秒（默认 flush 间隔）再刷新大盘即可看到样本。

## 数据脱敏建议

默认仅采集 URL（不含查询参数敏感值），如需进一步过滤：

```ts
resourcePlugin({
  ignoreUrls: [/token=/, /signature=/],
});
```
