/**
 * Re-export shared 的 Zod Schema 与类型，避免模块间重复定义
 *
 * Swagger 文档由 Controller 装饰器承担描述职责；请求体形状以 shared Schema 为准。
 */
export { IngestRequestSchema, type IngestRequest } from "@g-heal-claw/shared";
