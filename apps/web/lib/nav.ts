import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  FileText,
  LayoutGrid,
  Network,
  Plus,
  Radio,
  Settings,
  Box,
  Users,
} from "lucide-react";

// 管理后台菜单元数据：Sidebar / Topbar / 路由生成的单一事实源
// slug 与 app/(dashboard)/<slug>/page.tsx 严格一一对应
export interface NavItem {
  readonly slug: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** 未落地时的提示短语，展示在 PlaceholderPage 中；本期已落地的页面传 null */
  readonly placeholder: string | null;
}

export const NAV: readonly NavItem[] = [
  { slug: "overview", label: "数据总览", icon: LayoutGrid, placeholder: "Phase 6 交付" },
  { slug: "performance", label: "页面性能", icon: Activity, placeholder: null },
  { slug: "logs", label: "日志查询", icon: FileText, placeholder: "Phase 3 交付" },
  { slug: "errors", label: "异常分析", icon: AlertTriangle, placeholder: "Phase 1 交付" },
  { slug: "visits", label: "页面访问", icon: Users, placeholder: "Phase 2 交付" },
  { slug: "api", label: "API 监控", icon: Network, placeholder: "Phase 2 交付" },
  { slug: "resources", label: "静态资源", icon: Box, placeholder: "Phase 3 交付" },
  { slug: "custom", label: "自定义上报", icon: Plus, placeholder: "Phase 3 交付" },
  { slug: "realtime", label: "通信监控", icon: Radio, placeholder: "SPEC 待补齐（ADR-0013）" },
  { slug: "projects", label: "应用管理", icon: Settings, placeholder: "Phase 1 交付" },
] as const;

export function findNav(slug: string): NavItem | undefined {
  return NAV.find((n) => n.slug === slug);
}
