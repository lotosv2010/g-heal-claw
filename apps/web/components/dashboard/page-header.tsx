import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: React.ReactNode;
  readonly className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        // 苹果官网标题风格：更大字号、收紧字距、弱化底边框
        "mb-6 flex items-start justify-between gap-4 border-b border-black/[0.04] pb-5 dark:border-white/[0.06]",
        className,
      )}
    >
      <div>
        <h1 className="text-foreground text-[22px] font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
