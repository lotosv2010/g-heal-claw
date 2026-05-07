"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartTheme } from "@/lib/use-chart-theme";

const RawLine = dynamic(() => import("@ant-design/plots").then((m) => m.Line), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

const RawDualAxes = dynamic(() => import("@ant-design/plots").then((m) => m.DualAxes), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

const RawPie = dynamic(() => import("@ant-design/plots").then((m) => m.Pie), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

const RawFunnel = dynamic(() => import("@ant-design/plots").then((m) => m.Funnel), {
  ssr: false,
  loading: () => <Skeleton className="h-60 w-full" />,
});

/**
 * 自动适配深色主题的 AntV 图表组件
 *
 * 所有页面的图表统一从此处导入，无需单独处理 theme。
 */
export function ThemedLine(props: Record<string, unknown>) {
  const theme = useChartTheme();
  return <RawLine {...props} theme={theme} />;
}

export function ThemedDualAxes(props: Record<string, unknown>) {
  const theme = useChartTheme();
  return <RawDualAxes {...props} theme={theme} />;
}

export function ThemedPie(props: Record<string, unknown>) {
  const theme = useChartTheme();
  return <RawPie {...props} theme={theme} />;
}

export function ThemedFunnel(props: Record<string, unknown>) {
  const theme = useChartTheme();
  return <RawFunnel {...props} theme={theme} />;
}
