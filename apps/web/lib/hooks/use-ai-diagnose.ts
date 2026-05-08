"use client";

import { useCallback } from "react";
import { useAiDrawer } from "@/components/ai/ai-provider";
import { createConversation, updateConversationTitle } from "@/lib/api/ai-chat";
import { useActiveProject } from "./use-active-project";

/**
 * AI 诊断通用 hook
 *
 * 调用后会：创建新会话 → 打开抽屉 → 自动发送诊断消息
 */
export function useAiDiagnose() {
  const projectId = useActiveProject();
  const { setOpen } = useAiDrawer();

  const diagnose = useCallback(
    async (message: string, title?: string) => {
      const convTitle = title ?? message.slice(0, 30);
      const conv = await createConversation(projectId, convTitle);
      updateConversationTitle(conv.id, convTitle);

      // 先打开抽屉，延迟后再派发事件确保组件已挂载
      setOpen(true);
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("ai-start-conversation", {
            detail: { conversationId: conv.id, message, title: convTitle },
          }),
        );
      }, 150);
    },
    [projectId, setOpen],
  );

  return { diagnose };
}
