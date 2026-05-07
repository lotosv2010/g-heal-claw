import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger as PinoLogger } from "nestjs-pino";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module.js";
import { loadServerEnv } from "./config/env.js";
import { LoggingInterceptor } from "./shared/interceptors/logging.interceptor.js";

async function bootstrap(): Promise<void> {
  const env = loadServerEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { bufferLogs: true },
  );

  // 使用 pino 作为全局日志（替代 NestJS 内置 ConsoleLogger）
  app.useLogger(app.get(PinoLogger));

  // 全局请求日志拦截器（补充路由级耗时）
  app.useGlobalInterceptors(new LoggingInterceptor());

  // sendBeacon 以 text/plain 发送 JSON，需注册 parser 使 Fastify 正确解析 body
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser(
    "text/plain",
    { parseAs: "string" },
    (_req: unknown, body: string, done: (err: null, result: unknown) => void) => {
      try {
        done(null, JSON.parse(body));
      } catch {
        done(null, body);
      }
    },
  );

  // Sourcemap .map 文件上传（单文件 ≤ 50MB）
  await app.register(multipart as never, { limits: { fileSize: 50 * 1024 * 1024 } });

  // CORS：允许 web 前台与 examples/nextjs-demo（3100）
  app.enableCors({
    origin: [env.PUBLIC_WEB_BASE_URL, "http://localhost:3100"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  // Swagger 仅非生产环境挂载
  if (env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("g-heal-claw server")
      .setDescription("骨架阶段：Gateway 收端 + 健康检查")
      .setVersion("0.0.1")
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, doc);
  }

  await app.listen({ port: env.SERVER_PORT, host: "0.0.0.0" });

  const logger = new Logger("bootstrap");
  logger.log(
    `server listening on :${env.SERVER_PORT} (env=${env.NODE_ENV}, cors+=localhost:3100)`,
  );
}

void bootstrap();
