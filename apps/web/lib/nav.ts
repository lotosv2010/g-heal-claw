import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Box,
  Crosshair,
  FileText,
  FolderKanban,
  Funnel,
  KeyRound,
  LayoutGrid,
  MousePointerClick,
  Network,
  Plus,
  Radio,
  Repeat,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  Users,
} from "lucide-react";

// 管理后台菜单元数据：Sidebar / Topbar / 路由生成的单一事实源
// slug 与 app/(console)/<slug>/page.tsx 严格一一对应
// slug 的第一段即 NavGroup.key（如 dashboard/overview、monitor/errors、tracking/events、settings/projects）
// 物理目录、URL、菜单分组三者完全统一

/** 二级菜单项（叶子） */
export interface NavChild {
  /** 完整 slug，形如 "<group>/<child>"，如 "monitor/errors"、"settings/projects" */
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** 未落地时的提示短语；已 live 页面传 null */
  readonly placeholder: string | null;
}

/** 一级分组 */
export interface NavGroup {
  /** 分组 key（非路由，仅用于折叠状态） */
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly children: readonly NavChild[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutGrid,
    children: [
      {
        slug: "dashboard/overview",
        label: "数据总览",
        icon: LayoutGrid,
        placeholder: null,
      },
      {
        slug: "dashboard/realtime",
        label: "实时监控",
        icon: Radio,
        placeholder: null,
      },
    ],
  },
  {
    key: "monitor",
    label: "监控中心",
    icon: Activity,
    children: [
      { slug: "monitor/errors", label: "异常分析", icon: AlertTriangle, placeholder: null },
      { slug: "monitor/performance", label: "页面性能", icon: Activity, placeholder: null },
      { slug: "monitor/api", label: "API 监控", icon: Network, placeholder: null },
      { slug: "monitor/visits", label: "页面访问", icon: Users, placeholder: "Phase 2 交付" },
      { slug: "monitor/resources", label: "静态资源", icon: Box, placeholder: null },
      { slug: "monitor/logs", label: "日志查询", icon: FileText, placeholder: "Phase 3 交付" },
    ],
  },
  {
    key: "tracking",
    label: "埋点分析",
    icon: MousePointerClick,
    children: [
      {
        slug: "tracking/events",
        label: "事件分析",
        icon: MousePointerClick,
        placeholder: null,
      },
      {
        slug: "tracking/exposure",
        label: "曝光分析",
        icon: Crosshair,
        placeholder: null,
      },
      {
        slug: "tracking/funnel",
        label: "转化漏斗",
        icon: Funnel,
        placeholder: null,
      },
      {
        slug: "tracking/retention",
        label: "用户留存",
        icon: Repeat,
        placeholder: "Phase 6 交付",
      },
      { slug: "tracking/custom", label: "自定义上报", icon: Plus, placeholder: "Phase 3 交付" },
    ],
  },
  {
    key: "settings",
    label: "系统设置",
    icon: Settings,
    children: [
      {
        slug: "settings/projects",
        label: "应用管理",
        icon: FolderKanban,
        placeholder: "Phase 1 交付",
      },
      {
        slug: "settings/sourcemaps",
        label: "Source Map",
        icon: UploadCloud,
        placeholder: "Phase 1 交付",
      },
      {
        slug: "settings/alerts",
        label: "告警规则",
        icon: SlidersHorizontal,
        placeholder: "Phase 4 交付",
      },
      {
        slug: "settings/channels",
        label: "通知渠道",
        icon: Radio,
        placeholder: "Phase 4 交付",
      },
      {
        slug: "settings/members",
        label: "成员与权限",
        icon: ShieldCheck,
        placeholder: "Phase 1 交付",
      },
      {
        slug: "settings/ai",
        label: "AI 修复配置",
        icon: Bot,
        placeholder: "Phase 5 交付",
      },
      {
        slug: "settings/tokens",
        label: "API Keys",
        icon: KeyRound,
        placeholder: "Phase 1 交付",
      },
    ],
  },
] as const;

/** 扁平化所有叶子菜单，供 findNav / pathname 匹配 */
const FLAT_CHILDREN: readonly NavChild[] = NAV_GROUPS.flatMap((g) => g.children);

/** 去除前后 "/" */
function normalizeSlug(slug: string): string {
  return slug.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * 按 slug 查找叶子菜单（slug 统一为 "<group>/<child>" 二段式）
 * @example findNav("monitor/errors") / findNav("settings/projects")
 */
export function findNav(slug: string): NavChild | undefined {
  return FLAT_CHILDREN.find((c) => c.slug === normalizeSlug(slug));
}

/**
 * 按 pathname 解析叶子菜单（Topbar 标题用）
 * 取前两段匹配，形如 "/monitor/errors" → slug="monitor/errors"
 */
export function findNavByPathname(pathname: string): NavChild | undefined {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2) return undefined;
  return findNav(`${segs[0]}/${segs[1]}`);
}

/** 按叶子 slug 反查所属分组 key（Sidebar 展开态默认值用） */
export function findGroupKey(slug: string): string | undefined {
  const normalized = normalizeSlug(slug);
  // slug 的第一段即分组 key，直接取头
  const head = normalized.split("/")[0];
  if (!head) return undefined;
  return NAV_GROUPS.find((g) => g.key === head)?.key;
}

/** 按 pathname 反查所属分组 key */
export function findGroupKeyByPathname(pathname: string): string | undefined {
  const head = pathname.split("/").filter(Boolean)[0];
  if (!head) return undefined;
  return NAV_GROUPS.find((g) => g.key === head)?.key;
}
