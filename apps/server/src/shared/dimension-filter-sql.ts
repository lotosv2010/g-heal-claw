import { sql, type SQL } from "drizzle-orm";
import {
  type DimensionFilter,
  getActiveFilters,
} from "@g-heal-claw/shared";

/**
 * 将 DimensionFilter 转为 SQL WHERE 片段（AND 连接）
 *
 * 返回空 SQL 片段时表示无筛选条件，可以安全拼接到现有 WHERE 后。
 * 用法：sql`... WHERE project_id = ${pid} ${buildDimensionWhere(filters)}`
 */
export function buildDimensionWhere(filters?: DimensionFilter): SQL {
  if (!filters) return sql``;

  const active = getActiveFilters(filters);
  if (active.length === 0) return sql``;

  const parts: SQL[] = [];
  for (const { column, values } of active) {
    if (values.length === 1) {
      // 单值走 = 更高效
      parts.push(sql.raw(`AND ${quoteIdent(column)} = `) as SQL);
      parts.push(sql`${values[0]}`);
    } else {
      // 多值走 IN
      parts.push(sql.raw(`AND ${quoteIdent(column)} IN (`) as SQL);
      const valueParts = values.map((v, i) => {
        if (i === 0) return sql`${v}`;
        return sql`, ${v}`;
      });
      for (const vp of valueParts) parts.push(vp);
      parts.push(sql.raw(`)`) as SQL);
    }
  }

  // 合并为单个 SQL 模板
  let result = sql``;
  for (const part of parts) {
    result = sql`${result}${part}`;
  }
  return result;
}

/** 安全引用标识符（防 SQL 注入） */
function quoteIdent(name: string): string {
  // 只允许字母数字下划线，阻止任何注入尝试
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid column identifier: ${name}`);
  }
  return `"${name}"`;
}
