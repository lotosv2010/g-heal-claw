import { describe, it, expect } from "vitest";

describe("HealService", () => {
  it("模块可正常导入", async () => {
    const { HealService } = await import("../../../src/modules/heal/heal.service.js");
    expect(HealService).toBeDefined();
  });
});
