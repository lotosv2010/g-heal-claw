import { z } from "zod";

/**
 * 多维下钻筛选参数（T6.1.3）
 *
 * 所有 Dashboard 大盘 API 的通用可选筛选条件。
 * 前端通过 URL searchParams 传递，后端拼接 WHERE 子句。
 * 支持多选（逗号分隔），空值表示不筛选。
 */

/** 支持的筛选维度枚举 */
export const DIMENSION_KEYS = [
  "browser",
  "os",
  "deviceType",
  "language",
  "timezone",
  "pagePath",
] as const;

export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** 维度 → DB 列名映射 */
export const DIMENSION_COLUMN_MAP: Record<DimensionKey, string> = {
  browser: "browser",
  os: "os",
  deviceType: "device_type",
  language: "language",
  timezone: "timezone",
  pagePath: "page_path",
} as const;

/** 逗号分隔字符串转数组（去重 + 去空） */
const csvToArray = z
  .string()
  .transform((v) => [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))]);

/**
 * 维度筛选 Schema（可选字段，适合 .merge 到各 QuerySchema）
 *
 * 示例 query: ?browser=Chrome,Firefox&os=Windows&deviceType=mobile
 */
export const DimensionFilterSchema = z.object({
  /** 浏览器名称（多选逗号分隔） */
  browser: csvToArray.optional(),
  /** 操作系统（多选逗号分隔） */
  os: csvToArray.optional(),
  /** 设备类型：desktop / mobile / tablet */
  deviceType: csvToArray.optional(),
  /** 语言代码（如 zh-CN, en-US） */
  language: csvToArray.optional(),
  /** IANA 时区（如 Asia/Shanghai） */
  timezone: csvToArray.optional(),
  /** 页面路径（多选逗号分隔） */
  pagePath: csvToArray.optional(),
});

export type DimensionFilter = z.infer<typeof DimensionFilterSchema>;

/** 从 DimensionFilter 提取非空筛选条件列表 */
export function getActiveFilters(
  filters: DimensionFilter,
): readonly { key: DimensionKey; column: string; values: string[] }[] {
  const result: { key: DimensionKey; column: string; values: string[] }[] = [];
  for (const key of DIMENSION_KEYS) {
    const values = filters[key];
    if (values && values.length > 0) {
      result.push({ key, column: DIMENSION_COLUMN_MAP[key], values });
    }
  }
  return result;
}
