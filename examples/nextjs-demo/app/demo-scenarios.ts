/**
 * Demo 测试场景目录 —— 按 apps/web 后台菜单分组
 *
 * 分组规则（与 apps/web/lib/nav.ts 一一对应）：
 *  - performance: 页面性能（Web Vitals / LCP / CLS / INP / TBT 等）
 *  - errors:      异常分析（JS 运行时异常、Promise、白屏）
 *  - api:         API 监控（fetch / XHR 业务层 + HTTP 层）
 *  - resources:   静态资源（JS / CSS / Image / Media 加载失败）
 *
 * 这样导航语义与 Web 后台菜单完全一致，便于联调时按大盘模块定位来源。
 */

export type ScenarioGroupKey =
  | "performance"
  | "errors"
  | "api"
  | "resources"
  | "tracking"
  | "custom"
  | "visits";

export interface ScenarioRoute {
  readonly href: string;
  readonly label: string;
  readonly hint: string;
}

export interface ScenarioGroup {
  readonly key: ScenarioGroupKey;
  /** 菜单/分组标题（与后台菜单标签对齐） */
  readonly title: string;
  /** 首页区段副文 */
  readonly description: string;
  /** 视觉色（仅用于 demo 首页卡片微弱区分） */
  readonly accent: "blue" | "indigo" | "teal" | "amber" | "violet" | "rose";
  readonly routes: readonly ScenarioRoute[];
}

export const SCENARIO_GROUPS: readonly ScenarioGroup[] = [
  {
    key: "performance",
    title: "页面性能",
    description: "Web Vitals 与渲染性能指标 · 映射到大盘「页面性能」",
    accent: "blue",
    routes: [
      { href: "/perf/heavy-dom", label: "Heavy DOM", hint: "大量节点 → FCP/LCP 压力" },
      { href: "/perf/slow-image", label: "Slow Image", hint: "大图 LCP 目标" },
      { href: "/perf/layout-shift", label: "Layout Shift", hint: "触发 CLS" },
      { href: "/perf/long-task", label: "Long Task", hint: "主线程阻塞 → INP 劣化" },
      { href: "/perf/tbt", label: "TBT", hint: "总阻塞时间 · Lighthouse 核心指标" },
      { href: "/perf/fid", label: "FID (deprecated)", hint: "首次输入延迟 · 已被 INP 取代" },
      { href: "/perf/tti", label: "TTI (deprecated)", hint: "可交互时间 · Google 已停止维护" },
    ],
  },
  {
    key: "errors",
    title: "异常分析",
    description: "JS 运行时与白屏异常 · 映射到大盘「异常分析」",
    accent: "amber",
    routes: [
      { href: "/errors/sync", label: "Sync Throw (js)", hint: "同步异常 + captureException" },
      { href: "/errors/runtime", label: "Runtime TypeError (js)", hint: "undefined 属性访问" },
      { href: "/errors/promise", label: "Promise Reject", hint: "未处理的 rejection" },
      { href: "/errors/white-screen", label: "White Screen", hint: "手动上报 subType=white_screen" },
    ],
  },
  {
    key: "api",
    title: "API 监控",
    description: "fetch / XHR 网络异常 · 映射到大盘「API 监控」",
    accent: "indigo",
    routes: [
      { href: "/errors/ajax-fail", label: "Ajax 异常", hint: "fetch / XHR 非 2xx 或网络失败" },
      { href: "/errors/api-code", label: "API Code 异常", hint: "响应 code ≠ 0 的业务异常" },
    ],
  },
  {
    key: "resources",
    title: "静态资源",
    description:
      "JS / CSS / 图片 / 媒体加载（含全量 RT 样本 + 加载失败 2 种上报路径） · 映射到大盘「静态资源」",
    accent: "teal",
    routes: [
      {
        href: "/resources/slow-script",
        label: "慢脚本（RT 样本）",
        hint: "动态注入慢 JS，驱动 Top 慢资源 / 资源分类",
      },
      {
        href: "/resources/image-gallery",
        label: "图片批量（RT 样本）",
        hint: "一次加载多张随机图，观察 image 桶与 Top 慢资源",
      },
      { href: "/errors/js-load", label: "JS 加载异常", hint: "404 的 <script>" },
      { href: "/errors/image-load", label: "图片加载异常", hint: "404 的 <img>" },
      { href: "/errors/css-load", label: "CSS 加载异常", hint: "404 的 <link stylesheet>" },
      { href: "/errors/media-load", label: "音视频加载异常", hint: "404 的 <video> / <audio>" },
      { href: "/errors/resource", label: "Resource 404（综合）", hint: "静态资源加载失败样例" },
    ],
  },
  {
    key: "tracking",
    title: "埋点分析",
    description: "click / expose / submit / code 4 类埋点 · 映射到大盘「事件分析」",
    accent: "violet",
    routes: [
      {
        href: "/tracking/playground",
        label: "埋点 Playground",
        hint: "一页包含 4 类事件触发入口（速查）",
      },
      {
        href: "/tracking/click",
        label: "Click 全埋点",
        hint: "data-track / data-track-id 点击采集",
      },
      {
        href: "/tracking/submit",
        label: "Submit 全埋点",
        hint: "form 提交采集（capture 阶段）",
      },
      {
        href: "/tracking/expose",
        label: "Expose 曝光",
        hint: "IntersectionObserver + 停留判定",
      },
      {
        href: "/tracking/code",
        label: "Code 代码埋点",
        hint: "GHealClaw.track(name, props) 主动上报（旧版 trackPlugin）",
      },
      {
        href: "/tracking/funnel",
        label: "转化漏斗触发器",
        hint: "view_home → click_cta → submit_form，驱动 Web 大盘漏斗",
      },
    ],
  },
  {
    key: "visits",
    title: "页面访问",
    description:
      "PageView 采集（硬刷新 / SPA 切换 / 后退前进） · 映射到大盘「监控 → 页面访问」",
    accent: "teal",
    routes: [
      {
        href: "/visits/page-view",
        label: "PageView 场景",
        hint: "pushState / reload / popstate 触发 type=page_view 上报",
      },
    ],
  },
  {
    key: "custom",
    title: "自定义上报",
    description:
      "customPlugin 主动 API（track / time / log） · 映射到大盘「埋点分析 → 自定义上报」与「监控 → 自定义日志」",
    accent: "rose",
    routes: [
      {
        href: "/custom/track",
        label: "Custom Track（custom_event）",
        hint: "GHealClaw.track · 业务埋点 p50 大盘",
      },
      {
        href: "/custom/time",
        label: "Custom Time（custom_metric）",
        hint: "GHealClaw.time · p50/p75/p95 分位数",
      },
      {
        href: "/custom/log",
        label: "Custom Log（custom_log）",
        hint: "GHealClaw.log · info/warn/error 三级别",
      },
    ],
  },
] as const;
