import { Injectable, Logger } from "@nestjs/common";
import { eq, desc, sql } from "drizzle-orm";
import {
  generateConversationId,
  generateMessageId,
} from "@g-heal-claw/shared";
import { DatabaseService } from "../../shared/database/database.service.js";
import { aiConversations } from "../../shared/database/schema/ai-conversations.js";
import { aiMessages } from "../../shared/database/schema/ai-messages.js";

interface PaginatedResult<T> {
  readonly data: T[];
  readonly pagination: { readonly page: number; readonly limit: number; readonly total: number };
}

/**
 * AI 对话会话管理 + 消息持久化
 *
 * 不涉及 LLM 调用（由 Next.js API Route 负责）。
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  public constructor(private readonly database: DatabaseService) {}

  async createConversation(
    projectId: string,
    userId: string,
    title?: string,
  ): Promise<typeof aiConversations.$inferSelect> {
    const db = this.database.db;
    if (!db) {
      return {
        id: generateConversationId(),
        projectId,
        userId,
        title: title ?? "新对话",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const id = generateConversationId();
    const [conversation] = await db
      .insert(aiConversations)
      .values({ id, projectId, userId, title: title ?? "新对话" })
      .returning();

    return conversation!;
  }

  async listConversations(
    projectId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<typeof aiConversations.$inferSelect>> {
    const db = this.database.db;
    if (!db) {
      return { data: [], pagination: { page, limit, total: 0 } };
    }

    const offset = (page - 1) * limit;
    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(aiConversations)
        .where(sql`${aiConversations.projectId} = ${projectId} AND ${aiConversations.userId} = ${userId}`)
        .orderBy(desc(aiConversations.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiConversations)
        .where(sql`${aiConversations.projectId} = ${projectId} AND ${aiConversations.userId} = ${userId}`),
    ]);

    const total = countResult[0]?.count ?? 0;
    return { data, pagination: { page, limit, total } };
  }

  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return true;

    const result = await db
      .delete(aiConversations)
      .where(sql`${aiConversations.id} = ${conversationId} AND ${aiConversations.userId} = ${userId}`)
      .returning({ id: aiConversations.id });

    return result.length > 0;
  }

  async getMessages(
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<typeof aiMessages.$inferSelect>> {
    const db = this.database.db;
    if (!db) {
      return { data: [], pagination: { page, limit, total: 0 } };
    }

    const offset = (page - 1) * limit;
    const [data, countResult] = await Promise.all([
      db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId))
        .orderBy(aiMessages.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationId)),
    ]);

    const total = countResult[0]?.count ?? 0;
    return { data, pagination: { page, limit, total } };
  }

  async updateTitle(conversationId: string, title: string): Promise<void> {
    const db = this.database.db;
    if (!db) return;
    await db.update(aiConversations)
      .set({ title })
      .where(eq(aiConversations.id, conversationId));
  }

  async saveUserMessage(conversationId: string, content: string): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    await db.insert(aiMessages).values({
      id: generateMessageId(),
      conversationId,
      role: "user",
      content,
      metadata: {},
    });

    await db.update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversations.id, conversationId));
  }

  async saveAssistantMessage(conversationId: string, content: string): Promise<void> {
    const db = this.database.db;
    if (!db) return;

    await db.insert(aiMessages).values({
      id: generateMessageId(),
      conversationId,
      role: "assistant",
      content,
      metadata: {},
    });
  }
}
