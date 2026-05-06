import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * 全局 HTTP 请求日志拦截器
 *
 * 每个请求输出：method path status durationMs
 * 非生产环境额外输出 query 参数便于调试。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<FastifyRequest>();
    const start = Date.now();
    const { method, url } = req;

    return next.handle().pipe(
      tap({
        next: () => {
          const reply = ctx.getResponse<FastifyReply>();
          const duration = Date.now() - start;
          this.logger.log(`${method} ${url} ${reply.statusCode} ${duration}ms`);
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          const status = (err as { status?: number })?.status ?? 500;
          this.logger.warn(`${method} ${url} ${status} ${duration}ms — ${(err as Error)?.message ?? "unknown"}`);
        },
      }),
    );
  }
}
