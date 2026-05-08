import { describe, it, expect } from "vitest";
import {
  DimensionFilterSchema,
  getActiveFilters,
  DIMENSION_KEYS,
  DIMENSION_COLUMN_MAP,
} from "../../src/filters/dimension-filter.js";

describe("DimensionFilterSchema", () => {
  it("全部为空时 parse 通过（无筛选）", () => {
    const result = DimensionFilterSchema.parse({});
    expect(result.browser).toBeUndefined();
    expect(result.os).toBeUndefined();
  });

  it("逗号分隔字符串转数组", () => {
    const result = DimensionFilterSchema.parse({ browser: "Chrome,Firefox" });
    expect(result.browser).toEqual(["Chrome", "Firefox"]);
  });

  it("去重 + 去空", () => {
    const result = DimensionFilterSchema.parse({ os: "Windows,,Windows,Linux," });
    expect(result.os).toEqual(["Windows", "Linux"]);
  });

  it("trim 空格", () => {
    const result = DimensionFilterSchema.parse({ language: " zh-CN , en-US " });
    expect(result.language).toEqual(["zh-CN", "en-US"]);
  });

  it("单值不需要逗号", () => {
    const result = DimensionFilterSchema.parse({ deviceType: "mobile" });
    expect(result.deviceType).toEqual(["mobile"]);
  });

  it("多维度同时筛选", () => {
    const result = DimensionFilterSchema.parse({
      browser: "Chrome",
      os: "Windows,macOS",
      pagePath: "/home,/about",
    });
    expect(result.browser).toEqual(["Chrome"]);
    expect(result.os).toEqual(["Windows", "macOS"]);
    expect(result.pagePath).toEqual(["/home", "/about"]);
  });
});

describe("getActiveFilters", () => {
  it("无筛选返回空数组", () => {
    const filters = DimensionFilterSchema.parse({});
    expect(getActiveFilters(filters)).toEqual([]);
  });

  it("返回非空筛选条件", () => {
    const filters = DimensionFilterSchema.parse({
      browser: "Chrome",
      os: "Windows",
    });
    const active = getActiveFilters(filters);
    expect(active).toHaveLength(2);
    expect(active[0]).toEqual({ key: "browser", column: "browser", values: ["Chrome"] });
    expect(active[1]).toEqual({ key: "os", column: "os", values: ["Windows"] });
  });

  it("column 映射正确（deviceType → device_type）", () => {
    const filters = DimensionFilterSchema.parse({ deviceType: "mobile" });
    const active = getActiveFilters(filters);
    expect(active[0]!.column).toBe("device_type");
  });

  it("pagePath 映射为 page_path", () => {
    const filters = DimensionFilterSchema.parse({ pagePath: "/home" });
    const active = getActiveFilters(filters);
    expect(active[0]!.column).toBe("page_path");
  });
});

describe("常量完整性", () => {
  it("DIMENSION_KEYS 有 6 个维度", () => {
    expect(DIMENSION_KEYS).toHaveLength(6);
  });

  it("DIMENSION_COLUMN_MAP 覆盖所有 key", () => {
    for (const key of DIMENSION_KEYS) {
      expect(DIMENSION_COLUMN_MAP[key]).toBeDefined();
    }
  });
});
