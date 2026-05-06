import type { Plugin } from "../plugin.js";
import type { Hub } from "../hub.js";

export interface ContextPluginOptions {
  /** 是否解析 UTM 参数，默认 true */
  readonly utm?: boolean;
  /** 是否检测搜索引擎来源，默认 true */
  readonly searchEngine?: boolean;
  /** 是否检测流量渠道，默认 true */
  readonly channel?: boolean;
}

/**
 * 上下文增强插件（T1.2.4）
 *
 * 在 BaseEvent 已有的 device/page 骨架之上，补全：
 *  - UTM 参数解析（source/medium/campaign/term/content）
 *  - 搜索引擎来源检测
 *  - 流量渠道自动归因
 *
 * 采集结果写入 hub.scope.context["page_extra"]，由 collectPage() 读取合并。
 */
export function contextPlugin(opts: ContextPluginOptions = {}): Plugin {
  const enableUtm = opts.utm !== false;
  const enableSearchEngine = opts.searchEngine !== false;
  const enableChannel = opts.channel !== false;

  return {
    name: "context",
    setup(hub: Hub) {
      if (typeof window === "undefined") return;

      const extra: Record<string, unknown> = {};

      if (enableUtm) {
        const utm = parseUtmParams(window.location.search);
        if (utm) extra.utm = utm;
      }

      if (enableSearchEngine) {
        const se = detectSearchEngine(document.referrer);
        if (se) extra.searchEngine = se;
      }

      if (enableChannel) {
        const ch = detectChannel(
          window.location.search,
          document.referrer,
        );
        if (ch) extra.channel = ch;
      }

      if (Object.keys(extra).length > 0) {
        hub.setContext("page_extra", extra);
      }
    },
  };
}

export interface UtmParams {
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly term?: string;
  readonly content?: string;
}

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

export function parseUtmParams(search: string): UtmParams | undefined {
  if (!search) return undefined;
  const params = new URLSearchParams(search);
  const result: Record<string, string> = {};
  let found = false;
  for (const key of UTM_KEYS) {
    const val = params.get(`utm_${key}`);
    if (val) {
      result[key] = val;
      found = true;
    }
  }
  return found ? (result as UtmParams) : undefined;
}

const SEARCH_ENGINE_PATTERNS: readonly [RegExp, string][] = [
  [/\bgoogle\./i, "google"],
  [/\bbing\./i, "bing"],
  [/\bbaidu\./i, "baidu"],
  [/\bsogou\./i, "sogou"],
  [/\b360\.cn/i, "360"],
  [/\bso\.com/i, "360"],
  [/\byahoo\./i, "yahoo"],
  [/\bduckduckgo\./i, "duckduckgo"],
  [/\byandex\./i, "yandex"],
];

export function detectSearchEngine(referrer: string): string | undefined {
  if (!referrer) return undefined;
  for (const [re, name] of SEARCH_ENGINE_PATTERNS) {
    if (re.test(referrer)) return name;
  }
  return undefined;
}

export function detectChannel(search: string, referrer: string): string | undefined {
  const params = new URLSearchParams(search);
  const utmMedium = params.get("utm_medium")?.toLowerCase();

  if (utmMedium) {
    if (/^(cpc|ppc|paidsearch)$/.test(utmMedium)) return "paid_search";
    if (/^(display|banner|cpm)$/.test(utmMedium)) return "display";
    if (/^(social|social-network|social_media)$/.test(utmMedium)) return "social";
    if (/^(email|e-mail|newsletter)$/.test(utmMedium)) return "email";
    if (/^(affiliate|referral)$/.test(utmMedium)) return "referral";
  }

  if (!referrer) return "direct";

  try {
    const refHost = new URL(referrer).hostname;
    if (refHost === window.location.hostname) return undefined;
    if (detectSearchEngine(referrer)) return "organic_search";
    if (/\b(facebook|twitter|linkedin|weibo|zhihu|xiaohongshu)\./i.test(refHost)) {
      return "social";
    }
    return "referral";
  } catch {
    return "referral";
  }
}
