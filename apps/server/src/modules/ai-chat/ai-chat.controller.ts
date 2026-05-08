import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import type { JwtAuthContext } from "../auth/jwt-auth.guard.js";
import { AiChatService } from "./ai-chat.service.js";
import {
  CreateConversationSchema,
  ConversationListQuerySchema,
  MessageListQuerySchema,
  type CreateConversationDto,
  type ConversationListQueryDto,
  type MessageListQueryDto,
} from "./dto/ai-chat.dto.js";

type AuthedRequest = FastifyRequest & { user?: JwtAuthContext };

/**
 * AI 对话会话管理 + 消息持久化
 *
 * LLM 流式调用由 Next.js API Route (/api/ai/chat) 负责，
 * 本 Controller 仅处理会话 CRUD 和消息存取。
 */
@ApiTags("AI Chat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/ai")
export class AiChatController {
  public constructor(private readonly aiChatService: AiChatService) {}

  @Post("conversations")
  @ApiOperation({ summary: "创建 AI 对话" })
  async createConversation(
    @Query("projectId") projectId: string,
    @Body(new ZodValidationPipe(CreateConversationSchema))
    dto: CreateConversationDto,
    @Req() req: AuthedRequest,
  ): Promise<{ data: unknown }> {
    const userId = req.user!.userId;
    const conversation = await this.aiChatService.createConversation(
      projectId,
      userId,
      dto.title,
    );
    return { data: conversation };
  }

  @Get("conversations")
  @ApiOperation({ summary: "查询 AI 对话列表" })
  async listConversations(
    @Query("projectId") projectId: string,
    @Query(new ZodValidationPipe(ConversationListQuerySchema))
    query: ConversationListQueryDto,
    @Req() req: AuthedRequest,
  ): Promise<unknown> {
    const userId = req.user!.userId;
    return await this.aiChatService.listConversations(
      projectId,
      userId,
      query.page,
      query.limit,
    );
  }

  @Delete("conversations/:id")
  @ApiOperation({ summary: "删除 AI 对话" })
  async deleteConversation(
    @Param("id") conversationId: string,
    @Req() req: AuthedRequest,
  ): Promise<{ data: { success: boolean } }> {
    const userId = req.user!.userId;
    const success = await this.aiChatService.deleteConversation(
      conversationId,
      userId,
    );
    return { data: { success } };
  }

  @Get("conversations/:id/messages")
  @ApiOperation({ summary: "查询对话消息列表" })
  async getMessages(
    @Param("id") conversationId: string,
    @Query(new ZodValidationPipe(MessageListQuerySchema))
    query: MessageListQueryDto,
  ): Promise<unknown> {
    return await this.aiChatService.getMessages(
      conversationId,
      query.page,
      query.limit,
    );
  }

  @Post("conversations/:id/title")
  @ApiOperation({ summary: "更新对话标题" })
  async updateTitle(
    @Param("id") conversationId: string,
    @Body() body: { title: string },
  ): Promise<{ ok: boolean }> {
    await this.aiChatService.updateTitle(conversationId, body.title);
    return { ok: true };
  }

  @Post("conversations/:id/save")
  @ApiOperation({ summary: "保存对话消息（用户 + 助手，由 Next.js 回调）" })
  async saveMessages(
    @Param("id") conversationId: string,
    @Body() body: { userContent: string; assistantContent: string },
  ): Promise<{ ok: boolean }> {
    await this.aiChatService.saveUserMessage(conversationId, body.userContent);
    await this.aiChatService.saveAssistantMessage(conversationId, body.assistantContent);
    return { ok: true };
  }
}
