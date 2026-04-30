import { describe, expect, it } from "vitest";
import {
  addDays,
  toIsoDate,
  toIsoWeekMonday,
  weeklyPartitionName,
} from "../../../src/modules/partitions/partition-maintenance.service.js";

/**
 * 分区维护工具函数单测（TM.E.5 / ADR-0026）
 *
 * 不依赖 DB；仅验证 ISO 周计算 + 命名规则的正确性。
 */
describe("PartitionMaintenance utils", () => {
  it("toIsoWeekMonday：周三 → 同周周一", () => {
    const wed = new Date(Date.UTC(2026, 3, 29)); // 2026-04-29 周三
    const monday = toIsoWeekMonday(wed);
    expect(toIsoDate(monday)).toBe("2026-04-27");
  });

  it("toIsoWeekMonday：周日 → 上一个周一（ISO 8601）", () => {
    const sun = new Date(Date.UTC(2026, 4, 3)); // 2026-05-03 周日
    const monday = toIsoWeekMonday(sun);
    expect(toIsoDate(monday)).toBe("2026-04-27");
  });

  it("toIsoWeekMonday：周一本身保持不变", () => {
    const mon = new Date(Date.UTC(2026, 3, 27)); // 2026-04-27 周一
    const monday = toIsoWeekMonday(mon);
    expect(toIsoDate(monday)).toBe("2026-04-27");
  });

  it("addDays / toIsoDate：跨月正确", () => {
    const d = new Date(Date.UTC(2026, 3, 30));
    expect(toIsoDate(addDays(d, 2))).toBe("2026-05-02");
  });

  it("weeklyPartitionName：2026-04-27（ISO 18 周）", () => {
    expect(weeklyPartitionName(new Date(Date.UTC(2026, 3, 27)))).toBe(
      "events_raw_2026w18",
    );
  });

  it("weeklyPartitionName：2026-05-11（ISO 20 周）", () => {
    expect(weeklyPartitionName(new Date(Date.UTC(2026, 4, 11)))).toBe(
      "events_raw_2026w20",
    );
  });

  it("weeklyPartitionName：2026-06-15（ISO 25 周）", () => {
    expect(weeklyPartitionName(new Date(Date.UTC(2026, 5, 15)))).toBe(
      "events_raw_2026w25",
    );
  });
});
