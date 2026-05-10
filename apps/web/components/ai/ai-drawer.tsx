"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Bot, Plus, Send, Trash2, X, MessageSquare, Sparkles, Zap, Shield, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  saveMessages,
  streamMessage,
  updateConversationTitle,
  type Conversation,
  type Message,
} from "@/lib/api/ai-chat";
import { AiMessage } from "./ai-message";
import { HealTriggerButton } from "./heal-trigger-button";

interface AiDrawerProps {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * AI 对话抽屉（全局右侧面板，占窗口 1/3 宽）
 */
export function AiDrawer({ projectId, open, onOpenChange }: AiDrawerProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);

  const toggleSidebar = useCallback((open: boolean) => {
    if (open) {
      setSidebarVisible(true);
      requestAnimationFrame(() => setSidebarOpen(true));
    } else {
      setSidebarOpen(false);
      setTimeout(() => setSidebarVisible(false), 200);
    }
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const skipLoadRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamContent, scrollToBottom]);

  useEffect(() => {
    if (!open || !projectId) return;
    loadConversations();
  }, [open, projectId]);

  // 监听外部触发的 AI 诊断事件
  const sendDirectMessage = useCallback(async (convId: string, content: string) => {
    const userMsg: Message = { id: `temp-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
    setMessages([userMsg]);
    setStreaming(true);
    setStreamContent("");

    const { reader, abort } = streamMessage(convId, content, projectId, undefined, []);
    abortRef.current = abort;

    let accumulated = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += value;
        setStreamContent(accumulated);
      }
    } catch { /* 中止或网络错误 */ } finally {
      if (accumulated) {
        const assistantMsg: Message = { id: `temp-${Date.now()}-ai`, role: "assistant", content: accumulated, createdAt: new Date().toISOString() };
        setMessages((prev) => [...prev, assistantMsg]);
        saveMessages(convId, content, accumulated);
      }
      setStreamContent("");
      setStreaming(false);
      abortRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { conversationId, message, title, issueId } = (e as CustomEvent).detail as {
        conversationId: string; message: string; title: string; issueId?: string;
      };
      const newConv: Conversation = { id: conversationId, title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      setConversations((prev) => [newConv, ...prev]);
      skipLoadRef.current = true;
      setActiveId(conversationId);
      setActiveIssueId(issueId ?? null);
      sendDirectMessage(conversationId, message);
    };
    window.addEventListener("ai-start-conversation", handler);
    return () => window.removeEventListener("ai-start-conversation", handler);
  }, [sendDirectMessage]);

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await listConversations(projectId);
      setConversations(res.data);
      if (res.data.length > 0 && !activeId) {
        setActiveId(res.data[0].id);
      }
    } catch { /* 静默 */ } finally {
      setLoadingConvs(false);
    }
  }, [projectId, activeId]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    if (skipLoadRef.current) { skipLoadRef.current = false; return; }
    loadMessages(activeId);
  }, [activeId]);

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await listMessages(convId);
      setMessages(res.data);
    } catch { setMessages([]); } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const handleNewConversation = useCallback(async (title?: string) => {
    try {
      const conv = await createConversation(projectId, title);
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
      return conv.id;
    } catch { return null; }
  }, [projectId]);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        setActiveId(remaining.length > 0 ? remaining[0].id : null);
        if (remaining.length === 0) setMessages([]);
      }
    } catch { /* 静默 */ }
  }, [activeId, conversations]);

  const handleSend = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const content = inputValue.trim();
    if (!content || streaming) return;

    let convId = activeId;
    if (!convId) {
      convId = await handleNewConversation(content.slice(0, 30));
      if (!convId) return;
    }

    const userMsg: Message = { id: `temp-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setStreaming(true);
    setStreamContent("");

    const { reader, abort } = streamMessage(convId, content, projectId, undefined, messages);
    abortRef.current = abort;

    let accumulated = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += value;
        setStreamContent(accumulated);
      }
    } catch { /* 中止或网络错误 */ } finally {
      if (accumulated) {
        const assistantMsg: Message = { id: `temp-${Date.now()}-ai`, role: "assistant", content: accumulated, createdAt: new Date().toISOString() };
        setMessages((prev) => [...prev, assistantMsg]);
        if (convId) saveMessages(convId, content, accumulated);

        // 首条消息时用问题内容更新会话标题
        if (messages.length === 0 && convId) {
          const title = content.slice(0, 30);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, title } : c)),
          );
          updateConversationTitle(convId, title);
        }
      }
      setStreamContent("");
      setStreaming(false);
      abortRef.current = null;
    }
  }, [inputValue, streaming, activeId, projectId]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  useEffect(() => { if (!open && abortRef.current) abortRef.current(); }, [open]);

  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeId), [conversations, activeId]);

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={() => onOpenChange(false)}
          aria-hidden
        />
      )}

      {/* 抽屉面板 - 占窗口 1/3 宽 */}
      <div
        className={cn(
          "bg-background fixed inset-y-0 right-0 z-50 flex w-[33vw] min-w-[400px] max-w-[640px] flex-col border-l shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="AI 助手"
        aria-modal="true"
      >
        {/* 头部 */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b bg-gradient-to-r from-primary/5 to-transparent px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-sm">
              <Bot className="size-4 text-primary-foreground" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">AI 智能助手</h2>
              <p className="text-[10px] text-muted-foreground">异常诊断 · 性能优化 · 智能修复</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => onOpenChange(false)} aria-label="关闭">
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {/* 主体 */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">

          {/* 会话列表浮层 */}
          {sidebarVisible && (
            <>
              <div
                className={cn(
                  "absolute inset-0 z-10 transition-opacity duration-200",
                  sidebarOpen ? "bg-black/10 opacity-100" : "opacity-0",
                )}
                onClick={() => toggleSidebar(false)}
                aria-hidden
              />
              <div
                className={cn(
                  "absolute top-0 left-0 z-20 flex w-48 flex-col border-r bg-background shadow-lg rounded-br-lg transition-transform duration-200",
                  sidebarOpen ? "translate-x-0" : "-translate-x-full",
                )}
                style={{ bottom: "8.75rem" }}
              >
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loadingConvs ? (
                <div className="text-muted-foreground flex items-center justify-center py-8 text-xs">加载中...</div>
              ) : conversations.length === 0 ? (
                <div className="text-muted-foreground flex flex-col items-center justify-center gap-1 py-8 text-xs">
                  <MessageSquare className="size-5 opacity-40" />
                  <span>暂无对话</span>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={cn(
                        "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-all",
                        activeId === conv.id
                          ? "bg-primary/10 text-primary font-medium shadow-sm"
                          : "hover:bg-muted text-foreground/80",
                      )}
                      onClick={() => setActiveId(conv.id)}
                    >
                      <MessageSquare className="size-3 shrink-0 opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{conv.title || "新对话"}</span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`删除: ${conv.title}`}
                          >
                            <Trash2 className="size-3" aria-hidden />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-3" side="right" align="start">
                          <p className="text-xs text-muted-foreground mb-2">确定删除该对话？</p>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2">取消</Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                            >
                              删除
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {/* 消息区 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!activeId && !streaming ? (
                <WelcomeScreen />
              ) : loadingMsgs ? (
                <div className="text-muted-foreground flex items-center justify-center py-8 text-xs">加载消息...</div>
              ) : (
                <>
                  {messages.length === 0 && !streaming && <WelcomeScreen title={activeConversation?.title} />}
                  {messages.map((msg) => (
                    <AiMessage key={msg.id} role={msg.role} content={msg.content} />
                  ))}
                  {streaming && streamContent && <AiMessage role="assistant" content={streamContent} streaming />}
                  {streaming && !streamContent && (
                    <div className="flex justify-start py-2">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block size-2 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
                          <span className="inline-block size-2 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
                          <span className="inline-block size-2 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
                        </span>
                      </div>
                    </div>
                  )}
                  {/* 有 issueId 且 AI 已回复时显示修复按钮 */}
                  {activeIssueId && !streaming && messages.some((m) => m.role === "assistant") && (
                    <div className="flex justify-start py-1">
                      <HealTriggerButton projectId={projectId} issueId={activeIssueId} />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* 输入区 */}
            <div className="shrink-0 border-t bg-muted/20 px-4 pt-3 pb-2">
              <form data-ai-form onSubmit={handleSend} className="flex items-end gap-2">
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg"
                    onClick={() => toggleSidebar(!sidebarOpen)}
                    aria-label="切换会话列表"
                    title="会话历史"
                  >
                    {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg"
                    onClick={() => handleNewConversation()}
                    aria-label="新对话"
                    title="新对话"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="描述你的问题，AI 将为你分析并提供解决方案..."
                  disabled={streaming}
                  rows={3}
                  className="border-input bg-background placeholder:text-muted-foreground flex-1 resize-none rounded-xl border px-4 py-3 text-sm shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:shadow-md"
                  aria-label="消息输入框"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-10 shrink-0 rounded-xl shadow-sm"
                  disabled={!inputValue.trim() || streaming}
                  aria-label="发送消息"
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              </form>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/60">
                Enter 发送 · Shift+Enter 换行 · AI 回复仅供参考
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** 欢迎屏 */
function WelcomeScreen({ title }: { title?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      {/* Logo */}
      <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent shadow-inner">
        <Bot className="size-8 text-primary" />
      </div>

      {/* 标题 */}
      <div className="text-center">
        <h3 className="text-lg font-semibold tracking-tight">{title || "你好，我是 AI 助手"}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          我可以帮你分析异常、诊断性能瓶颈、提供修复建议
        </p>
      </div>

      {/* 能力卡片 */}
      <div className="grid w-full max-w-xs gap-2.5">
        <CapabilityCard
          icon={<Sparkles className="size-4 text-amber-500" />}
          title="异常诊断"
          description="分析错误根因，提供修复方案"
        />
        <CapabilityCard
          icon={<Zap className="size-4 text-blue-500" />}
          title="性能优化"
          description="识别性能瓶颈，给出优化建议"
        />
        <CapabilityCard
          icon={<Shield className="size-4 text-green-500" />}
          title="智能修复"
          description="自动生成修复代码并创建 PR"
        />
      </div>

      {/* 提示 */}
      <p className="text-xs text-muted-foreground/70">
        输入问题开始对话，或在异常详情页点击「AI 方案」一键诊断
      </p>
    </div>
  );
}

function CapabilityCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 transition-colors hover:bg-card">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
