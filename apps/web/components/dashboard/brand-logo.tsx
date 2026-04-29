import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 品牌 Logo —— 苹果风格化的监控 mark
 *
 * 造型：rounded-xl 深浅蓝对角渐变 + 内嵌白色心电/脉冲线（监控语义）
 * 尺寸由 className 控制（size-7 适用于 Sidebar 头部）
 */
export function BrandLogo({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      <defs>
        <linearGradient id="ghc-logo-grad" x1="0" y1="0" x2="1" y2="1">
          {/* iOS System Blue → 深蓝对角渐变；深色模式下色更亮的 Dark Blue */}
          <stop offset="0%" stopColor="#0A84FF" />
          <stop offset="100%" stopColor="#0040A0" />
        </linearGradient>
      </defs>
      {/* 苹果化圆角矩形底座（rounded-xl 视觉等效 28% 圆角） */}
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        ry="9"
        fill="url(#ghc-logo-grad)"
      />
      {/* 脉冲线：左侧平 → 小尖 → 大尖 → 平 —— 监控/心电经典符号 */}
      <path
        d="M5 16 L10 16 L12 11 L15.5 22 L18 13 L20.5 18 L22 16 L27 16"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
