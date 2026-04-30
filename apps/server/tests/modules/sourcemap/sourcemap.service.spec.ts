import { describe, expect, it } from "vitest";
import { SourcemapService } from "../../../src/modules/sourcemap/sourcemap.service.js";
import { buildErrorEvent } from "../../fixtures.js";

/**
 * SourcemapService stub 契约（TM.E.3 / ADR-0026）
 *
 * 当前实现返回事件原引用；测试锁定契约——实装替换后必须继续通过：
 *  - 永不抛错
 *  - 输出长度等于输入长度
 *  - 元素顺序保持不变（Processor 依赖顺序稳定性，便于指纹聚合）
 */
describe("SourcemapService (stub)", () => {
  const svc = new SourcemapService();

  it("空输入返回空数组", async () => {
    await expect(svc.resolveFrames([])).resolves.toEqual([]);
  });

  it("单条事件原样返回", async () => {
    const evt = buildErrorEvent();
    const out = await svc.resolveFrames([evt]);
    expect(out).toHaveLength(1);
    expect(out[0]?.eventId).toBe(evt.eventId);
  });

  it("保持顺序稳定（3 条）", async () => {
    const events = [
      buildErrorEvent({ eventId: "11111111-2222-4333-8444-000000000001" }),
      buildErrorEvent({ eventId: "11111111-2222-4333-8444-000000000002" }),
      buildErrorEvent({ eventId: "11111111-2222-4333-8444-000000000003" }),
    ];
    const out = await svc.resolveFrames(events);
    expect(out.map((e) => e.eventId)).toEqual(events.map((e) => e.eventId));
  });
});
