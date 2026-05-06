import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { generateAlertRuleId, generateAlertHistoryId } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import type { CreateAlertRuleInput } from "./dto/create-alert-rule.dto.js";
import type { UpdateAlertRuleInput } from "./dto/update-alert-rule.dto.js";
import type { AlertHistoryQuery } from "./dto/alert-history-query.dto.js";

export interface AlertRuleItem {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly target: string;
  readonly condition: Record<string, unknown>;
  readonly filter: Record<string, unknown> | null;
  readonly severity: string;
  readonly cooldownMs: number;
  readonly channels: string[] | null;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlertHistoryItem {
  readonly id: string;
  readonly ruleId: string;
  readonly projectId: string;
  readonly status: string;
  readonly triggeredAt: string;
  readonly resolvedAt: string | null;
  readonly context: Record<string, unknown> | null;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  public constructor(private readonly database: DatabaseService) {}

  /** 列出项目下所有告警规则 */
  public async listRules(projectId: string): Promise<readonly AlertRuleItem[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      project_id: string;
      name: string;
      target: string;
      condition: Record<string, unknown>;
      filter: Record<string, unknown> | null;
      severity: string;
      cooldown_ms: number;
      channels: string[] | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, project_id, name, target, condition, filter,
             severity, cooldown_ms, channels, enabled, created_at, updated_at
      FROM alert_rules
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      target: r.target,
      condition: r.condition,
      filter: r.filter,
      severity: r.severity,
      cooldownMs: r.cooldown_ms,
      channels: r.channels,
      enabled: r.enabled,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  /** 根据 ID 获取单条告警规则 */
  public async getRuleById(ruleId: string): Promise<AlertRuleItem | null> {
    const db = this.database.db;
    if (!db) return null;

    const rows = await db.execute<{
      id: string;
      project_id: string;
      name: string;
      target: string;
      condition: Record<string, unknown>;
      filter: Record<string, unknown> | null;
      severity: string;
      cooldown_ms: number;
      channels: string[] | null;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT id, project_id, name, target, condition, filter,
             severity, cooldown_ms, channels, enabled, created_at, updated_at
      FROM alert_rules
      WHERE id = ${ruleId}
      LIMIT 1
    `);

    if (rows.length === 0) return null;

    const r = rows[0]!;
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      target: r.target,
      condition: r.condition,
      filter: r.filter,
      severity: r.severity,
      cooldownMs: r.cooldown_ms,
      channels: r.channels,
      enabled: r.enabled,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  /** 创建告警规则 */
  public async createRule(
    projectId: string,
    input: CreateAlertRuleInput,
  ): Promise<AlertRuleItem> {
    const db = this.database.db;
    if (!db) throw new NotFoundException("数据库不可用");

    const id = generateAlertRuleId();
    const channelsJson = input.channels ? JSON.stringify(input.channels) : null;

    await db.execute(sql`
      INSERT INTO alert_rules (id, project_id, name, target, condition, filter,
                               severity, cooldown_ms, channels, enabled, created_at, updated_at)
      VALUES (
        ${id},
        ${projectId},
        ${input.name},
        ${input.target},
        ${JSON.stringify(input.condition)}::jsonb,
        ${input.filter ? JSON.stringify(input.filter) : null}::jsonb,
        ${input.severity},
        ${input.cooldownMs},
        ${channelsJson}::jsonb,
        true,
        NOW(),
        NOW()
      )
    `);

    this.logger.log(`告警规则已创建: ${id} (project=${projectId})`);

    return {
      id,
      projectId,
      name: input.name,
      target: input.target,
      condition: input.condition,
      filter: input.filter ?? null,
      severity: input.severity,
      cooldownMs: input.cooldownMs,
      channels: input.channels ?? null,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** 更新告警规则 */
  public async updateRule(
    ruleId: string,
    input: UpdateAlertRuleInput,
  ): Promise<AlertRuleItem> {
    const db = this.database.db;
    if (!db) throw new NotFoundException("数据库不可用");

    // 构建动态 SET 子句
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      setClauses.push("name = $__name__");
      values.push(input.name);
    }
    if (input.target !== undefined) {
      setClauses.push("target = $__target__");
      values.push(input.target);
    }
    if (input.condition !== undefined) {
      setClauses.push("condition = $__condition__::jsonb");
      values.push(JSON.stringify(input.condition));
    }
    if (input.filter !== undefined) {
      setClauses.push("filter = $__filter__::jsonb");
      values.push(input.filter ? JSON.stringify(input.filter) : null);
    }
    if (input.severity !== undefined) {
      setClauses.push("severity = $__severity__");
      values.push(input.severity);
    }
    if (input.cooldownMs !== undefined) {
      setClauses.push("cooldown_ms = $__cooldown__");
      values.push(input.cooldownMs);
    }
    if (input.channels !== undefined) {
      setClauses.push("channels = $__channels__::jsonb");
      values.push(JSON.stringify(input.channels));
    }
    if (input.enabled !== undefined) {
      setClauses.push("enabled = $__enabled__");
      values.push(input.enabled);
    }

    // 使用 sql 模板逐字段更新（保持与项目其他服务一致的模式）
    await db.execute(sql`
      UPDATE alert_rules
      SET name = COALESCE(${input.name ?? null}, name),
          target = COALESCE(${input.target ?? null}, target),
          condition = COALESCE(${input.condition ? JSON.stringify(input.condition) : null}::jsonb, condition),
          filter = CASE WHEN ${input.filter !== undefined} THEN ${input.filter !== undefined ? (input.filter ? JSON.stringify(input.filter) : null) : null}::jsonb ELSE filter END,
          severity = COALESCE(${input.severity ?? null}, severity),
          cooldown_ms = COALESCE(${input.cooldownMs ?? null}, cooldown_ms),
          channels = COALESCE(${input.channels ? JSON.stringify(input.channels) : null}::jsonb, channels),
          enabled = COALESCE(${input.enabled ?? null}, enabled),
          updated_at = NOW()
      WHERE id = ${ruleId}
    `);

    const updated = await this.getRuleById(ruleId);
    if (!updated) {
      throw new NotFoundException({
        error: "ALERT_RULE_NOT_FOUND",
        message: "告警规则不存在",
      });
    }

    return updated;
  }

  /** 快速切换告警规则启用/禁用 */
  public async toggleEnabled(
    ruleId: string,
    enabled: boolean,
  ): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(sql`
      UPDATE alert_rules
      SET enabled = ${enabled}, updated_at = NOW()
      WHERE id = ${ruleId}
      RETURNING id
    `);

    return rows.length > 0;
  }

  /** 删除告警规则（级联删除关联历史） */
  public async deleteRule(ruleId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(sql`
      DELETE FROM alert_rules
      WHERE id = ${ruleId}
      RETURNING id
    `);

    if (rows.length > 0) {
      this.logger.log(`告警规则已删除: ${ruleId}`);
    }

    return rows.length > 0;
  }

  /** 分页查询告警历史 */
  public async listHistory(
    query: AlertHistoryQuery,
  ): Promise<{ data: readonly AlertHistoryItem[]; total: number }> {
    const db = this.database.db;
    if (!db) return { data: [], total: 0 };

    // 查询总数
    const countRows = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count
      FROM alert_history
      WHERE project_id = ${query.projectId}
        ${query.ruleId ? sql`AND rule_id = ${query.ruleId}` : sql``}
        ${query.status ? sql`AND status = ${query.status}` : sql``}
    `);
    const total = parseInt(countRows[0]?.count ?? "0", 10);

    // 查询数据
    const rows = await db.execute<{
      id: string;
      rule_id: string;
      project_id: string;
      status: string;
      triggered_at: string;
      resolved_at: string | null;
      context: Record<string, unknown> | null;
    }>(sql`
      SELECT id, rule_id, project_id, status, triggered_at, resolved_at, context
      FROM alert_history
      WHERE project_id = ${query.projectId}
        ${query.ruleId ? sql`AND rule_id = ${query.ruleId}` : sql``}
        ${query.status ? sql`AND status = ${query.status}` : sql``}
      ORDER BY triggered_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `);

    const data = rows.map((r) => ({
      id: r.id,
      ruleId: r.rule_id,
      projectId: r.project_id,
      status: r.status,
      triggeredAt: String(r.triggered_at),
      resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
      context: r.context,
    }));

    return { data, total };
  }
}
