import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bullmq";
import { sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { QueueName, generateAlertHistoryId } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";

/**
 * 告警规则条件结构
 */
type AlertCondition = {
  aggregation: string;
  operator: string;
  threshold: number;
  window: {
    durationMs: number;
    minSamples?: number;
  };
};

/**
 * 数据库中的告警规则行（type alias 以兼容 drizzle execute 泛型约束）
 */
type AlertRuleRow = {
  id: string;
  project_id: string;
  name: string;
  target: string;
  condition: AlertCondition;
  filter: Record<string, unknown> | null;
  severity: string;
  cooldown_ms: number;
  channels: string[] | null;
  enabled: boolean;
  last_fired_at: string | null;
};

/**
 * 通知队列载荷
 */
interface NotificationPayload {
  readonly historyId: string;
  readonly ruleId: string;
  readonly projectId: string;
  readonly channels: string[];
  readonly templateVars: Record<string, string>;
}

/**
 * AlertEvaluatorService（ADR-0035 T4.1.3）
 *
 * 每分钟 cron 触发，遍历所有启用的告警规则，根据条件判断是否触发告警。
 * 触发后写入 alert_history 并通过 BullMQ 通知队列分发通知。
 */
@Injectable()
export class AlertEvaluatorService {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  public constructor(
    private readonly database: DatabaseService,
    @InjectQueue(QueueName.Notifications) private readonly notificationQueue: Queue,
  ) {}

  /**
   * 每分钟执行一次告警规则评估
   */
  @Cron("*/1 * * * *")
  public async evaluateAll(): Promise<void> {
    const db = this.database.db;
    // test 环境跳过（db 为 null）
    if (!db) return;

    const rules = await db.execute<AlertRuleRow>(sql`
      SELECT id, project_id, name, target, condition, filter,
             severity, cooldown_ms, channels, enabled, last_fired_at
      FROM alert_rules
      WHERE enabled = true
    `);

    for (const rule of rules) {
      try {
        await this.evaluateRule(rule);
      } catch (err) {
        this.logger.error(
          `规则 ${rule.id} 评估失败: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * 评估单条告警规则
   */
  private async evaluateRule(rule: AlertRuleRow): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    const condition = rule.condition;

    // 冷却期检查：last_fired_at 在 cooldown_ms 内则跳过
    if (rule.last_fired_at) {
      const lastFired = new Date(rule.last_fired_at).getTime();
      const now = Date.now();
      if (now - lastFired < rule.cooldown_ms) {
        return;
      }
    }

    // 计算指标值
    const metricValue = await this.computeMetric(rule, condition);
    if (metricValue === null) return;

    // 比较阈值
    const fires = this.compareThreshold(
      metricValue,
      condition.operator,
      condition.threshold,
    );

    if (fires) {
      await this.fireAlert(rule, metricValue);
    } else {
      await this.tryResolve(rule);
    }
  }

  /**
   * 根据 target 类型计算聚合指标
   */
  private async computeMetric(
    rule: AlertRuleRow,
    condition: AlertCondition,
  ): Promise<number | null> {
    const db = this.database.db;
    if (!db) return null;

    const windowMs = condition.window.durationMs;
    const windowInterval = `${windowMs} milliseconds`;

    switch (rule.target) {
      case "error_rate": {
        const rows = await db.execute<{ error_count: string; total_count: string }>(sql`
          SELECT
            COUNT(*) FILTER (WHERE type = 'error') AS error_count,
            COUNT(*) AS total_count
          FROM error_events
          WHERE project_id = ${rule.project_id}
            AND timestamp >= NOW() - ${windowInterval}::interval
        `);
        const row = rows[0];
        if (!row) return null;
        const total = parseInt(row.total_count, 10);
        if (total === 0) return null;
        if (condition.window.minSamples && total < condition.window.minSamples) return null;
        return parseInt(row.error_count, 10) / total;
      }

      case "api_success_rate": {
        const rows = await db.execute<{ success_count: string; total_count: string }>(sql`
          SELECT
            COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 400) AS success_count,
            COUNT(*) AS total_count
          FROM api_events
          WHERE project_id = ${rule.project_id}
            AND timestamp >= NOW() - ${windowInterval}::interval
        `);
        const row = rows[0];
        if (!row) return null;
        const total = parseInt(row.total_count, 10);
        if (total === 0) return null;
        if (condition.window.minSamples && total < condition.window.minSamples) return null;
        return parseInt(row.success_count, 10) / total;
      }

      case "web_vital": {
        const metricName = (condition as unknown as { metric?: string }).metric ?? condition.aggregation;
        const rows = await db.execute<{ p_value: number | null }>(sql`
          SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p_value
          FROM performance_events
          WHERE project_id = ${rule.project_id}
            AND name = ${metricName}
            AND timestamp >= NOW() - ${windowInterval}::interval
        `);
        const row = rows[0];
        if (!row || row.p_value === null) return null;
        return row.p_value;
      }

      case "issue_count": {
        const rows = await db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT issue_id) AS cnt
          FROM error_events
          WHERE project_id = ${rule.project_id}
            AND timestamp >= NOW() - ${windowInterval}::interval
        `);
        const row = rows[0];
        if (!row) return null;
        return parseInt(row.cnt, 10);
      }

      case "custom_metric": {
        const agg = condition.aggregation.toUpperCase();
        let rows: { result: string | null }[];

        if (agg === "AVG") {
          rows = await db.execute<{ result: string | null }>(sql`
            SELECT AVG(value)::text AS result
            FROM custom_metrics_raw
            WHERE project_id = ${rule.project_id}
              AND timestamp >= NOW() - ${windowInterval}::interval
          `);
        } else if (agg === "SUM") {
          rows = await db.execute<{ result: string | null }>(sql`
            SELECT SUM(value)::text AS result
            FROM custom_metrics_raw
            WHERE project_id = ${rule.project_id}
              AND timestamp >= NOW() - ${windowInterval}::interval
          `);
        } else {
          // COUNT
          rows = await db.execute<{ result: string | null }>(sql`
            SELECT COUNT(*)::text AS result
            FROM custom_metrics_raw
            WHERE project_id = ${rule.project_id}
              AND timestamp >= NOW() - ${windowInterval}::interval
          `);
        }

        const row = rows[0];
        if (!row || row.result === null) return null;
        return parseFloat(row.result);
      }

      default:
        this.logger.warn(`未知告警目标类型: ${rule.target}`);
        return null;
    }
  }

  /**
   * 比较指标值与阈值
   */
  private compareThreshold(
    value: number,
    operator: string,
    threshold: number,
  ): boolean {
    switch (operator) {
      case "gt":
        return value > threshold;
      case "gte":
        return value >= threshold;
      case "lt":
        return value < threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
      case "neq":
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * 触发告警：写入历史 + 更新 last_fired_at + 入队通知
   */
  private async fireAlert(rule: AlertRuleRow, metricValue: number): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    const historyId = generateAlertHistoryId();

    // 插入 alert_history（firing 状态）
    await db.execute(sql`
      INSERT INTO alert_history (id, rule_id, project_id, status, triggered_at, context)
      VALUES (
        ${historyId},
        ${rule.id},
        ${rule.project_id},
        'firing',
        NOW(),
        ${JSON.stringify({ metricValue, target: rule.target, severity: rule.severity })}::jsonb
      )
    `);

    // 更新规则的 last_fired_at
    await db.execute(sql`
      UPDATE alert_rules
      SET last_fired_at = NOW(), updated_at = NOW()
      WHERE id = ${rule.id}
    `);

    // 入队通知
    if (rule.channels && rule.channels.length > 0) {
      const payload: NotificationPayload = {
        historyId,
        ruleId: rule.id,
        projectId: rule.project_id,
        channels: rule.channels,
        templateVars: {
          ruleName: rule.name,
          severity: rule.severity,
          target: rule.target,
          metricValue: String(metricValue),
        },
      };
      await this.notificationQueue.add("alert-notification", payload);
    }

    this.logger.log(
      `告警触发: rule=${rule.id} name="${rule.name}" metric=${metricValue}`,
    );
  }

  /**
   * 检查是否有正在触发的历史记录，若有则标记 resolved
   */
  private async tryResolve(rule: AlertRuleRow): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    const rows = await db.execute<{ id: string }>(sql`
      UPDATE alert_history
      SET status = 'resolved', resolved_at = NOW()
      WHERE rule_id = ${rule.id}
        AND status = 'firing'
      RETURNING id
    `);

    if (rows.length > 0) {
      this.logger.log(
        `告警恢复: rule=${rule.id} resolved=${rows.length} 条历史`,
      );
    }
  }
}
