import { describe, it, expect } from "vitest";
import { AiChatService } from "../../../src/modules/ai-chat/ai-chat.service.js";

describe("AiChatService（db=null 短路）", () => {
  const service = new AiChatService({ db: null } as never);

  it("createConversation 返回包含 conv_ 前缀的桩数据", async () => {
    const result = await service.createConversation("proj_test", "usr_test", "测试对话");
    expect(result.id).toMatch(/^conv_/);
    expect(result.projectId).toBe("proj_test");
    expect(result.userId).toBe("usr_test");
    expect(result.title).toBe("测试对话");
  });

  it("createConversation 无 title 时默认「新对话」", async () => {
    const result = await service.createConversation("proj_test", "usr_test");
    expect(result.title).toBe("新对话");
  });

  it("listConversations 返回空分页", async () => {
    const result = await service.listConversations("proj_test", "usr_test", 1, 20);
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0 });
  });

  it("deleteConversation 返回 true", async () => {
    const result = await service.deleteConversation("conv_test", "usr_test");
    expect(result).toBe(true);
  });

  it("getMessages 返回空分页", async () => {
    const result = await service.getMessages("conv_test", 1, 50);
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, limit: 50, total: 0 });
  });

  it("saveUserMessage 不抛错", async () => {
    await expect(service.saveUserMessage("conv_test", "hello")).resolves.toBeUndefined();
  });

  it("saveAssistantMessage 不抛错", async () => {
    await expect(service.saveAssistantMessage("conv_test", "你好")).resolves.toBeUndefined();
  });

  it("updateTitle 不抛错", async () => {
    await expect(service.updateTitle("conv_test", "新标题")).resolves.toBeUndefined();
  });
});
