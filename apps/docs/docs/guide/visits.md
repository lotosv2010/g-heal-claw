# 访问分析

路径：监控中心 → **访问分析** `/monitor/visits`

## 页面构成

1. **Summary 卡片**：UV / PV / 停留 / 跳出
2. **趋势图**：UV / PV 双轴时间曲线
3. **Top Pages**：访问量最高的页面
4. **来源分析**：referrer / utm_source 拆分
5. **设备 / 浏览器 / 地域** 分布

## 核心指标

| 指标 | 说明 |
|---|---|
| **UV** | 独立访客数（按 userId / deviceId 去重） |
| **PV** | 页面浏览量 |
| **停留时长** | 单页停留的中位数 / P75，从 `page_view` 到 `page_duration` 事件之间 |
| **跳出率** | 仅访问一个页面便离开的会话占比 |
| **新访客占比** | 新旧用户识别基于 localStorage 标识 |

## 常见操作

### 过滤「我自己」

在项目设置中配置「员工 IP 段」或通过 SDK `ignoreUsers` 选项排除内部访问。

### 按 UTM 参数查看投放效果

顶栏 UTM 过滤器（`utm_source` / `utm_medium` / `utm_campaign`）。
