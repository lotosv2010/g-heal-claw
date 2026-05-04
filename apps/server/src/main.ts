import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module.js";
import { loadServerEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = loadServerEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { bufferLogs: true },
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
