/**
 * 预设告警规则模板（SPEC §7.3 / T4.1.4）
 *
 * 创建项目时自动插入这些预设规则（默认禁用），
 * 用户可在告警设置页面手动启用并调整阈值。
 */
export interface PresetAlertRule {
  readonly name: string;
  readonly target: string;
  readonly condition: {
    readonly aggregation: string;
    readonly operator: string;
    readonly threshold: number;
    readonly window: {
      readonly durationMs: number;
      readonly minSamples?: number;
    };
  };
  readonly severity: string;
  readonly cooldownMs: number;
  readonly filter?: Record<string, string>;
}

export const PRESET_ALERT_RULES: readonly PresetAlertRule[] = [
  {
    name: "错误率突增",
    target: "error_rate",
    condition: {
      aggregation: "rate",
      operator: ">",
      threshold: 0.05,
      window: { durationMs: 300000, minSamples: 10 },
    },
    severity: "critical",
    cooldownMs: 600000,
  },
  {
    name: "JS 错误数激增",
    target: "issue_count",
    condition: {
      aggregation: "count",
      operator: ">",
      threshold: 50,
      window: { durationMs: 300000 },
    },
    severity: "warning",
    cooldownMs: 600000,
  },
  {
    name: "关键页面 LCP 劣化",
    target: "web_vital",
    condition: {
      aggregation: "p95",
      operator: ">",
      threshold: 4000,
      window: { durationMs: 600000, minSamples: 5 },
    },
    severity: "warning",
    cooldownMs: 600000,
    filter: { metric: "LCP" },
  },
  {
    name: "API 成功率下降",
    target: "api_success_rate",
    condition: {
      aggregation: "rate",
      operator: "<",
      threshold: 0.95,
      window: { durationMs: 300000, minSamples: 20 },
    },
    severity: "critical",
    cooldownMs: 600000,
  },
  {
    name: "慢 API Top",
    target: "custom_metric",
    condition: {
      aggregation: "p95",
      operator: ">",
      threshold: 3000,
      window: { durationMs: 600000 },
    },
    severity: "warning",
    cooldownMs: 600000,
  },
  {
    name: "白屏事件出现",
    target: "error_rate",
    condition: {
      aggregation: "count",
      operator: ">=",
      threshold: 1,
      window: { durationMs: 300000 },
    },
    severity: "critical",
    cooldownMs: 300000,
    filter: { subType: "white_screen" },
  },
] as const;
