import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DIMENSION_COLUMN_MAP, type DimensionKey } from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import type {
  DimensionValuesQuery,
  DimensionValuesResponse,
  DimensionValueItem,
} from "../dto/dimension-values.dto.js";

@Injectable()
export class DimensionsService {
  public constructor(private readonly database: DatabaseService) {}

  public async getValues(
    query: DimensionValuesQuery,
  ): Promise<DimensionValuesResponse> {
    const db = this.database.db;
    if (!db) {
      return { dimension: query.dimension, values: [] };
    }

    const { projectId, dimension, windowHours, limit, source, environment } = query;
    const column = DIMENSION_COLUMN_MAP[dimension as DimensionKey];
    const sinceMs = Date.now() - windowHours * 3600_000;

    // 安全检查列名
    if (!/^[a-z_][a-z0-9_]*$/.test(column)) {
      return { dimension, values: [] };
    }

    const envFilter = environment
      ? sql`AND environment = ${environment}`
      : sql``;

    const rows = await db.execute<{ value: string; count: string | number }>(sql`
      SELECT
        ${sql.raw(`"${column}"`)} AS value,
        COUNT(*) AS count
      FROM ${sql.raw(`"${source}"`)}
      WHERE project_id = ${projectId}
        AND ts_ms >= ${sinceMs}
        AND ${sql.raw(`"${column}"`)} IS NOT NULL
        AND ${sql.raw(`"${column}"`)} != ''
        ${envFilter}
      GROUP BY ${sql.raw(`"${column}"`)}
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    const values: DimensionValueItem[] = rows.map((r) => ({
      value: String(r.value),
      count: Number(r.count),
    }));

    return { dimension, values };
  }
}
