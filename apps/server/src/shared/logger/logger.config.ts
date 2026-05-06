import type { Params } from "nestjs-pino";

/**
 * 统一日志配置（pino + nestjs-pino）
 *
 * 三种部署模式通过 LOG_TARGET 环境变量切换：
 *  - "stdout"（默认）：JSON 输出到 stdout，适合 Docker/K8s + Fluentd/Loki 采集
 *  - "file"：写本地文件 + 日志轮转，适合裸机/VM 部署
 *  - "cloud"：预留云日志 SDK（阿里云 SLS / AWS CloudWatch）接入口
 *
 * 开发环境自动启用 pino-pretty 美化输出。
 */
export function buildLoggerConfig(): Params {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const logTarget = process.env.LOG_TARGET ?? "stdout";
  const logLevel = process.env.LOG_LEVEL ?? (nodeEnv === "production" ? "info" : "debug");
  const logDir = process.env.LOG_DIR ?? "./logs";

  const isDev = nodeEnv !== "production";

  // pino transport 配置
  const targets: Array<{
    target: string;
    level: string;
    options: Record<string, unknown>;
  }> = [];

  if (logTarget === "file" || logTarget === "all") {
    targets.push({
      target: "pino-roll",
      level: logLevel,
      options: {
        file: `${logDir}/app.log`,
        frequency: "daily",
        mkdir: true,
        size: "50m",
        limit: { count: 14 },
      },
    });
  }

  if (logTarget === "stdout" || logTarget === "all" || targets.length === 0) {
    if (isDev) {
      targets.push({
        target: "pino-pretty",
        level: logLevel,
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
        },
      });
    } else {
      targets.push({
        target: "pino/file",
        level: logLevel,
        options: { destination: 1 },
      });
    }
  }

  // cloud 预留：后续接入阿里云 SLS / AWS CloudWatch 时在此添加 target
  if (logTarget === "cloud" || logTarget === "all") {
    // 示例：targets.push({ target: "pino-aliyun-sls", level: logLevel, options: { ... } });
    // 当前阶段仅注释占位，避免引入未安装的依赖
  }

  return {
    pinoHttp: {
      level: logLevel,
      transport: { targets },
      // 请求日志自动记录 method / url / statusCode / responseTime
      autoLogging: {
        ignore: (req) => {
          const url = (req as { url?: string }).url ?? "";
          // 健康检查不记录日志（避免噪声）
          return url === "/healthz" || url.startsWith("/_next");
        },
      },
      // 生产环境序列化请求体（脱敏）
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: nodeEnv === "production" ? undefined : req.headers,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  };
}
