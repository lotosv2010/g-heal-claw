#  ADR-0019: 异常监控模块 9 类目扩展 + 测试文件统一放置规则

| 字段 | 值 |
|---|---|
| 状态 | 采纳 |
| 日期 | 2026-04-28 |
| 决策人 | @gaowenbin |

## 背景

ADR-0016 的异常监控闭环切片（T1.2.2 / T1.4.0 / T1.6.2.0）以 5 个 `subType` 占位形态交付：`js / promise / resource / custom / other`。随后在需求对齐中明确：前端大盘希望按 **9 个业务类目**（JS 错误 / Promise 错误 / 白屏 / Ajax 异常 / JS 加载 / 图片加载 / CSS 加载 / 音视频资源 / 接口返回码）呈现堆叠柱 + 全部日志折线 + 排行，并在演示侧提供对应 7 个场景路由。当前差距：

- **采集层**：SDK 仅 `errorPlugin` 覆盖 JS / Promise / 资源 3 类；Ajax 错误与接口返回码异常无插件
- **Schema 层**：`ErrorEventSchema` 没有表达业务类目的字段，`resource` 无法区分 JS / 图片 / CSS / 媒体
- **存储层**：`error_events_raw` 缺少 Ajax / API code 相关列，无法落 URL / status / method / responseCode
- **大盘层**：`ErrorsService` 仅做 5 类 subType 占位聚合；Web `/errors` 是 summary + 环形 + 趋势 + 排行的旧布局，无法承接 9 类目

同时，Phase 1 前期为了"业务逻辑必须有单元测试"，`*.test.ts` / `*.spec.ts` 散落在各包 `src/` 下（共 19 个业务测试文件），与"规则即真相"相冲突：

- 构建产物（`dist/` / `.next/`）与测试共存于 `src/` 树，vitest / vite-plugin-dts 必须维护显式 exclude 列表
- `apps/server` 已经有 `test/` e2e 目录（fixtures + gateway.e2e-spec）；两套路径并行
- 审查无法一行 regex 判定测试放置是否合规

## 决策

### A. 9 类目扩展（errors 模块完整性切片）

| 层 | 变更 | 说明 |
|---|---|---|
| shared | `packages/shared/src/events/error.ts` 扩展 `category` 字段（9 值判别） | 采集端直接产出业务类目，避免下游反推 |
| sdk | 新增 `packages/sdk/src/plugins/http.ts`（Ajax 拦截 + 接口返回码判别） | `fetch` / `XHR` monkey-patch，失败与非 2xx 都落 `category: "ajax" \| "api_code"` |
| sdk | `errorPlugin` 按 `event.target` nodeName 细分资源类目 | `IMG → image_load` / `SCRIPT → js_load` / `LINK[rel=stylesheet] → css_load` / `AUDIO\|VIDEO → media` |
| sdk | `errorPlugin` 新增白屏心跳检测（非 DOM mutation 阈值） | `category: "white_screen"` |
| server | `error_events_raw` 增加 Ajax 相关列（迁移 `0002_errors_ajax_columns.sql`） | URL / method / status / response_code / request_id |
| server | `ErrorsService` 按 `category` 聚合 9 类目 rollup + 排行 | 废弃按 `sub_type` 的 5 类占位 |
| server | `ErrorsOverviewDto` 扩展：`categoryCards` / `stackBuckets` / `ranking` / `dimensions` | 替换旧的 summary/donut/trend/topGroups |
| web | 删除 `summary-cards` / `sub-type-donut` / `top-groups-table` / `trend-chart` | 旧布局整体下线 |
| web | 新增 `category-cards` / `dimension-tabs` / `ranking-table` / `stack-chart` | 9 格 + 维度 Tabs + 排行 + DualAxes 堆叠柱 + 全部日志折线（rose-600） |
| demo | 新增 7 个场景路由 `/errors/{ajax-fail,api-code,css-load,image-load,js-load,media-load,white-screen}` | 对齐 9 类目（`js` / `promise` 已有），便于冒烟演示 |

### B. 测试文件统一放置规则（强制）

1. **所有测试文件必须位于对应包/应用根目录下的 `tests/` 文件夹**
2. 目录结构镜像 `src/`：`packages/sdk/src/plugins/error.ts` → `packages/sdk/tests/plugins/error.test.ts`
3. 命名保留 `.test.ts` / `.spec.ts` 后缀（TSX 同理）
4. 端到端 / 集成测试按既有层次归类：`tests/unit/` / `tests/integration/` / `tests/e2e/`（按需）
5. **审查红线**：`src/**/*.{test,spec}.{ts,tsx}` 出现即判定违规

配套改动：

- 清理 Phase 1 前期散落的 19 个业务测试文件（sdk 12 / shared 4 / server 3）
- `apps/server/test/` → `apps/server/tests/`（保留 fixtures.ts 与 gateway.e2e-spec.ts）
- vitest / vite.config `include` 全部切换为 `tests/**/*.{test,spec}.ts`
- SDK `vite-plugin-dts` 移除对 `src/**/*.test.ts` 的排除（已无意义）
- `.claude/rules/coding.md` 新增「测试文件放置规则（强制）」小节
- `.claude/rules/review.md` 新增检查项 §8 + 常见问题速查条目

## 备选方案

1. **只做 5 类目扩展 + 保留 `sub_type` 字段主导聚合**：驳回，`resource` 在 5 值口径下必须靠 UA / 前端反推才能分 JS/图片/CSS/媒体，DB 聚合查询性能差且指标不可复用
2. **Ajax / 接口返回码走独立事件类型（不复用 ErrorEventSchema）**：驳回，会撑开 `SdkEventSchema` 判别联合分支，且排行 / 堆叠需要和其它异常跨类目合并展示，统一 `error` 域更直观
3. **测试保留 co-located 布局（`*.test.ts` 与 `*.ts` 并排）**：驳回，Vite/Vitest 社区双向布局都支持，但项目已出现 `apps/server/test/` 独立目录 + `packages/sdk/src/plugins/*.test.ts` 并行的混乱局面；二选一以 `tests/` 收敛可一行 regex 审查

## 影响

**收益**

- 异常模块从"占位闭环"升级为"业务可交付形态"：9 类目堆叠柱 + 折线 + 排行，对齐 PRD §2.2 终局
- SDK 增加 HTTP 插件，消费方无需自己封装 Ajax 监控；ESM 体积 36.10 KB gzip（未超预算，SDK 总预算 ≤ 50 KB）
- 所有测试集中在 `tests/`，与 `src/` 完全隔离；`src/**/*.{test,spec}.{ts,tsx}` 成为规则红线
- vitest config 简化：不再维护 exclude 列表

**成本 / 风险**

- 本切片**不补测试**（仅清理旧测试 + 落地规则）；后续每个 `tests/` 目录需要逐步补回核心路径单测，风险缺口由 E2E（`apps/server/tests/gateway.e2e-spec.ts`）与手动冒烟兜底
- `error_events_raw` 加列 + 旧列保留，drizzle 迁移 `0002` 向前兼容；但线上已入库的旧数据 `category` 为 NULL，聚合查询需要 `COALESCE` 默认到 "js"/"resource"
- Ajax 拦截 monkey-patch `fetch` / `XHR` 会影响第三方 SDK（如埋点）；已添加 `ignoreUrls` 过滤并默认跳过 `PUBLIC_API_BASE_URL` 的上报请求（避免自己监控自己导致雪崩）

**指标影响**

- Web `/errors` 首屏由 4 组件（卡片 / 环形 / 趋势 / 排行）变为 3 组件（9 格卡片 / 堆叠柱 / 排行 + 维度 Tabs）；`force-dynamic` 维持不变
- SDK ESM 产物：`errorPlugin` 新增资源细分 + 白屏心跳逻辑；`httpPlugin` 首次引入
- Server e2e：`gateway.e2e-spec.ts` 保持 4 用例不变；单元测试体积降为 0，由后续补回

## 后续

**立即跟进**

- [ ] 各包 `tests/` 骨架补回：`packages/shared/tests/{env,events,queues,id}/*.{test,spec}.ts` / `packages/sdk/tests/plugins/{error,http}.test.ts` / `apps/server/tests/dashboard/errors.service.spec.ts`
- [ ] 为 `httpPlugin` 补 E2E 冒烟：examples/nextjs-demo `/errors/ajax-fail` + `/errors/api-code` → server 日志应观测到 `category=ajax|api_code` 落库
- [ ] `docs/SPEC.md` §2.2 更新 9 类目矩阵，`docs/ARCHITECTURE.md` §3.4 同步 `httpPlugin` 到 SDK 插件拓扑

**长期**

- T1.4.1 ErrorProcessor（指纹聚合 + BullMQ 入队）落地时，复用本次扩展的 9 类目维度做 Issue `first_category`
- T1.6.2 ~ T1.6.6 Issues 完整 CRUD 上线后，Web `/errors` 会新增 Issue 详情页，本次新增的 `stack-chart` 会下钻到单 Issue 的类目分布

## 相关 ADR

- 被扩展：ADR-0016（异常监控闭环切片）
- 依赖：ADR-0009（shared 基线）/ ADR-0011（server 骨架）/ ADR-0017（Drizzle Schema 基线）
