# 访问分析指标

本页定义 `/monitor/visits` 所有卡片、趋势图与分布表的字段。

## 事件模型

SDK 在页面首次可见时上报 `page_view`，在页面隐藏（`visibilitychange → hidden` 或 `pagehide`）时上报 `page_duration`，二者共同构成一次访问记录。

| 字段 | 含义 |
|---|---|
| `userId` | 业务用户 ID（`setUser` 设置）；未登录回落 `deviceId` |
| `deviceId` | 浏览器级持久化标识（localStorage） |
| `sessionId` | 会话 ID（30 分钟无活动则新起一会） |
| `pageUrl` | 页面归一化路径 |
| `referrer` | 来源页 URL |
| `utm_source` / `utm_medium` / `utm_campaign` | UTM 营销参数（从 query 提取） |
| `duration` | 本次页面停留时长（ms） |

---

## 核心指标

| 指标 | 定义 | 计算 |
|---|---|---|
| **UV** | 独立访客数 | `COUNT(DISTINCT COALESCE(userId, deviceId))` |
| **PV** | 页面浏览量 | `COUNT(page_view events)` |
| **停留时长** | 单页停留的中位数 / P75 | `PERCENTILE(duration, 0.5 / 0.75)` |
| **跳出率** | 仅访问一个页面便离开的会话占比 | `COUNT(sessions WHERE pv=1) / COUNT(sessions)` |
| **新访客占比** | 首次出现的 `deviceId` 占比 | `COUNT(new deviceId) / UV` |

---

## Summary 卡片

左到右依次展示 UV / PV / 停留时长 P75 / 跳出率。数字右下小箭头为与上一同长度窗口的环比。

## 趋势图

双轴时间序列：左轴 UV / PV（柱状），右轴跳出率（折线）。桶大小规则同 [异常分析趋势图](/reference/error-metrics#趋势图)。

## Top Pages

| 列 | 口径 |
|---|---|
| Page | 归一化页面路径 |
| PV | 访问量 |
| UV | 独立访客数 |
| 平均停留 | `AVG(duration)` |
| 跳出率 | 针对该 Page 的单页会话占比 |

## 来源分析

按 `referrer` host 聚合（直接访问 / 搜索引擎 / 社交 / 其他）；同时按 `utm_source` 做第二维度拆分。

## 设备 / 浏览器 / 地域分布

| 维度 | 来源 |
|---|---|
| 设备 | User-Agent 解析 → `device.type`（desktop / mobile / tablet） |
| 浏览器 | UA 解析 → `browser.name` + `browser.version` |
| 操作系统 | UA 解析 → `os.name` + `os.version` |
| 地域 | Gateway 侧根据 IP 查询 GeoLite2，脱敏后仅保留到省/市 |

---

## 识别规则

- **新旧用户**：首次 `page_view` 的 `deviceId` 标记为新用户，之后 30 天内任意访问均视为老用户
- **会话**：同 `deviceId` 连续访问间隔 ≤ 30 分钟归为同一会话，否则新起一会
- **内部流量过滤**：项目设置「员工 IP 段」或 SDK `ignoreUsers` 配置排除；被过滤的事件不计入统计
