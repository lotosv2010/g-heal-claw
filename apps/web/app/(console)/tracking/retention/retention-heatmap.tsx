import type { RetentionCohort } from "@/lib/api/retention";

/**
 * 留存矩阵热力图（ADR-0028）
 *
 * CSS Grid 渲染：
 *  - 行：cohort 日期（ASC）
 *  - 列：day 0 ~ day returnDays
 *  - 单元格：留存率百分比 + 绿色色阶（0 ~ 100%）
 *
 * 不依赖图表库，避免水合开销；单元格 hover 显示精确数值。
 * 空矩阵时渲染占位文案，保持卡片高度一致。
 */
export function RetentionHeatmap({
  cohorts,
  returnDays,
}: {
  readonly cohorts: readonly RetentionCohort[];
  readonly returnDays: number;
}) {
  if (cohorts.length === 0) {
    return (
      <div className="text-muted-foreground py-16 text-center text-sm">
        当前窗口无 cohort 数据 · 请先确认 SDK page_view 已上报，或调整时间范围
      </div>
    );
  }

  const offsets = Array.from({ length: returnDays + 1 }, (_, i) => i);
  // Cohort 标签列 144px + 每列 offset 最小 48px，水平滚动兜底
  const gridTemplate = `144px repeat(${returnDays + 1}, minmax(48px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full space-y-1">
        {/* 表头：day offset */}
        <div
          className="grid items-center gap-1 text-[11px] font-medium"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="text-muted-foreground">Cohort · 新用户</div>
          {offsets.map((k) => (
            <div
              key={k}
              className="text-muted-foreground text-center tabular-nums"
            >
              day {k}
            </div>
          ))}
        </div>

        {cohorts.map((row) => (
          <div
            key={row.cohortDate}
            className="grid items-center gap-1 text-[11px]"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex flex-col">
              <span className="text-foreground font-medium tabular-nums">
                {row.cohortDate}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {row.cohortSize.toLocaleString()} 人
              </span>
            </div>
            {offsets.map((k) => {
              const v = row.retentionByDay[k] ?? 0;
              return (
                <Cell key={k} value={v} day={k} cohort={row.cohortDate} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cell({
  value,
  day,
  cohort,
}: {
  value: number;
  day: number;
  cohort: string;
}) {
  // 0~1 映射到 emerald 色阶：0 透明底 → 1 饱和绿；用 rgba 避免 tailwind 动态类被 purge
  const alpha = Math.max(0, Math.min(1, value));
  const bg = alpha === 0
    ? "transparent"
    : `rgba(16, 185, 129, ${0.12 + alpha * 0.7})`;
  const fg = alpha >= 0.5 ? "#ffffff" : "var(--foreground)";
  return (
    <div
      className="rounded-md border border-transparent px-2 py-1.5 text-center tabular-nums transition-colors"
      style={{ backgroundColor: bg, color: fg }}
      title={`${cohort} · day ${day} · ${(value * 100).toFixed(2)}%`}
    >
      {value > 0 ? `${(value * 100).toFixed(1)}%` : "—"}
    </div>
  );
}
