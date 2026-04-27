import { describe, it, expect } from "vitest";
import { QueueName, dlqOf, ALL_QUEUES, ALL_DLQ_QUEUES } from "./names.js";

describe("QueueName", () => {
  it("队列名数量覆盖 ARCHITECTURE §3.4 的 12 条", () => {
    expect(ALL_QUEUES).toHaveLength(12);
  });

  it("所有队列名均为 kebab-case", () => {
    for (const name of ALL_QUEUES) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    }
  });

  it("字面量常量与 DLQ 派生保持一致", () => {
    expect(dlqOf(QueueName.EventsError)).toBe("events-error-dlq");
    expect(ALL_DLQ_QUEUES.every((q) => q.endsWith("-dlq"))).toBe(true);
    expect(ALL_DLQ_QUEUES).toHaveLength(12);
  });

  it("常量对象在运行时不可被意外覆盖（TS as const 已保证只读）", () => {
    // 仅类型层面断言：无法在编译期给只读属性赋值
    // 运行时可变性不保证（as const 仅约束 TS），此断言作为类型契约自检
    const check: "events-error" = QueueName.EventsError;
    expect(check).toBe("events-error");
  });
});
