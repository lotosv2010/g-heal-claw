/**
 * 时间范围：顶栏与子页面共享的单一事实源
 *
 * 形态二选一：
 *  - 预设（24h 等）：URL 参数 `?range=<key>`
 *  - 自定义区间：URL 参数 `?from=<ISO>&to=<ISO>`，二者同时存在才生效
 *
 * 默认 24h（与 ADR-0015 大盘默认窗口一致）。
 */

export const TIME_PRESETS = [
  { key: "15m", label: "最近 15 分钟" },
  { key: "1h", label: "最近 1 小时" },
  { key: "24h", label: "最近 24 小时" },
  { key: "7d", label: "最近 7 天" },
  { key: "30d", label: "最近 30 天" },
] as const;

export type PresetKey = (typeof TIME_PRESETS)[number]["key"];

export const DEFAULT_PRESET: PresetKey = "24h";

export function isPresetKey(v: unknown): v is PresetKey {
  return (
    typeof v === "string" && TIME_PRESETS.some((p) => p.key === v)
  );
}

export function getPresetLabel(key: PresetKey): string {
  return TIME_PRESETS.find((p) => p.key === key)?.label ?? TIME_PRESETS[2].label;
}

/** 将预设转换为「性能视图」等标题中的时间短语 —— "最近 X" → "过去 X" */
export function getPresetPhrase(key: PresetKey): string {
  const label = getPresetLabel(key);
  return label.replace(/^最近\s*/, "过去 ");
}

/**
 * 自定义时间段（闭区间，毫秒时间戳）
 * 当 from/to 合法且 from <= to 时视为有效自定义。
 */
export interface CustomRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * 解析 URL SearchParams 获得当前时间选择
 *  - 优先 preset（如果存在且合法）
 *  - 否则 custom（如果 from/to 都合法）
 *  - 兜底默认 preset
 */
export type TimeSelection =
  | { readonly kind: "preset"; readonly preset: PresetKey }
  | { readonly kind: "custom"; readonly range: CustomRange };

export function parseTimeSelection(
  params: URLSearchParams | ReadonlyMap<string, string>,
): TimeSelection {
  const get = (k: string): string | null =>
    params instanceof URLSearchParams ? params.get(k) : params.get(k) ?? null;

  const rawRange = get("range");
  if (isPresetKey(rawRange)) return { kind: "preset", preset: rawRange };

  const fromMs = parseIsoMs(get("from"));
  const toMs = parseIsoMs(get("to"));
  if (fromMs != null && toMs != null && fromMs <= toMs) {
    return { kind: "custom", range: { fromMs, toMs } };
  }

  return { kind: "preset", preset: DEFAULT_PRESET };
}

function parseIsoMs(s: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** 格式化自定义区间为标题短语：`2026-04-25 ~ 2026-04-28` */
export function formatCustomPhrase(range: CustomRange): string {
  const fmt = (ms: number): string => {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return `${fmt(range.fromMs)} ~ ${fmt(range.toMs)}`;
}

/** 顶栏触发按钮 / 标题使用的文案 */
export function getSelectionLabel(sel: TimeSelection): string {
  return sel.kind === "preset"
    ? getPresetLabel(sel.preset)
    : formatCustomPhrase(sel.range);
}

export function getSelectionPhrase(sel: TimeSelection): string {
  return sel.kind === "preset"
    ? getPresetPhrase(sel.preset)
    : formatCustomPhrase(sel.range);
}

/**
 * 将 TimeSelection 换算为 Dashboard 接口需要的 `windowHours`
 *
 * 后端契约（apps/server DTO）：整数 1~720（即 1h ~ 30d）。
 * 粒度规则（全局）：
 *  - ≤ 1h（含 15m）：分钟级统计（date_trunc('minute')）
 *  - ≤ 24h：小时级统计（date_trunc('hour')）
 *  - > 24h（7d/30d/自定义）：天级统计（date_trunc('day')）
 */
export const DASHBOARD_WINDOW_MIN = 1;
export const DASHBOARD_WINDOW_MAX = 720;

export function toWindowHours(sel: TimeSelection): number {
  if (sel.kind === "preset") {
    switch (sel.preset) {
      case "15m":
        return 1;
      case "1h":
        return 1;
      case "24h":
        return 24;
      case "7d":
        return 168;
      case "30d":
        return 720;
    }
  }
  const hours = Math.ceil((sel.range.toMs - sel.range.fromMs) / 3_600_000);
  if (!Number.isFinite(hours) || hours < DASHBOARD_WINDOW_MIN)
    return DASHBOARD_WINDOW_MIN;
  if (hours > DASHBOARD_WINDOW_MAX) return DASHBOARD_WINDOW_MAX;
  return hours;
}

/**
 * 从 Next.js page searchParams 解析 windowHours（供所有 Server Component 页面复用）
 *
 * 将 Next.js 16 的 `Promise<Record<string, string | string[] | undefined>>` 标准化为 URLSearchParams
 * 再调用 parseTimeSelection → toWindowHours。
 */
export async function resolveWindowHours(
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<number> {
  const raw = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v.length > 0) qs.set(k, v[0] ?? "");
  }
  return toWindowHours(parseTimeSelection(qs));
}
