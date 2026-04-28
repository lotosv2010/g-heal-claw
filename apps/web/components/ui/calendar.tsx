"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { zhCN } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * shadcn/ui Calendar（基于 react-day-picker v9）
 *
 * 已默认启用：
 *  - 中文 locale（zhCN）—— 星期/月份短语中文化
 *  - 自定义导航图标（lucide）
 *  - Tailwind 主题变量（--primary/--accent/--muted 等）着色
 *
 * 支持 `mode` 原生透传：`"single" | "multiple" | "range"`；页面侧常用 range。
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      locale={zhCN}
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("bg-card p-3", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months,
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute top-0 inset-x-0 flex items-center justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "size-8 p-0 select-none aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-8 text-sm font-medium",
          defaultClassNames.month_caption,
        ),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 rounded-md text-[0.75rem] font-normal",
          defaultClassNames.weekday,
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn(
          "relative aspect-square h-8 w-8 p-0 text-center text-sm select-none [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md focus-within:relative focus-within:z-20",
          defaultClassNames.day,
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
          defaultClassNames.day_button,
        ),
        range_start: cn(
          "bg-accent rounded-l-md",
          defaultClassNames.range_start,
        ),
        range_middle: cn(
          "bg-accent [&_button]:rounded-none",
          defaultClassNames.range_middle,
        ),
        range_end: cn(
          "bg-accent rounded-r-md",
          defaultClassNames.range_end,
        ),
        selected: cn(
          "[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground [&_button]:focus:bg-primary [&_button]:focus:text-primary-foreground",
          defaultClassNames.selected,
        ),
        today: cn(
          "[&_button]:bg-accent [&_button]:text-accent-foreground",
          defaultClassNames.today,
        ),
        outside: cn(
          "day-outside text-muted-foreground",
          defaultClassNames.outside,
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cls, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className={cn("size-4", cls)} {...rest} />
          ) : (
            <ChevronRightIcon className={cn("size-4", cls)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
