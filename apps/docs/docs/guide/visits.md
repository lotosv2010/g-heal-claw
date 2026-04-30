# 页面访问

路径：监控中心 → **页面访问** `/monitor/visits`

## 页面构成

1. **Summary 卡片**：UV / PV / 停留时长 / 跳出率
2. **趋势图**：UV / PV 双轴时间曲线
3. **Top Pages**：访问量最高的页面
4. **来源分析**：referrer / utm_source 拆分
5. **设备 / 浏览器 / 地域** 分布

> 指标定义、会话与新旧用户判定规则见 [接口说明 · 访问分析指标](/reference/visits-metrics)。

## 常见操作

### 过滤「我自己」

项目设置中配置「员工 IP 段」，或通过 SDK `ignoreUsers` 选项排除内部访问。

### 按 UTM 参数查看投放效果

顶栏 UTM 过滤器（`utm_source` / `utm_medium` / `utm_campaign`）。

### 按设备 / 地域下钻

Dimension Tabs：`device` / `browser` / `os` / `country`。
