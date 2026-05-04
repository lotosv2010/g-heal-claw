import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenvFlow from "dotenv-flow";
import { ServerEnvSchema, parseEnv, EnvValidationError, type ServerEnv } from "@g-heal-claw/shared";

const thisFile = fileURLToPath(import.meta.url);
// monorepo 根：apps/server/dist/config/env.js → ../../../.. 或 apps/server/src/config/env.ts → ../../../..
const MONOREPO_ROOT = path.resolve(path.dirname(thisFile), "..", "..", "..", "..");

/**
 * 启动期 env 加载 + 校验
 *
 * - 显式指向 monorepo 根目录加载 `.env.local` > `.env.<NODE_ENV>` > `.env`
 *   不依赖 cwd，避免在 `pnpm -F @g-heal-claw/server dev` 时加载到 apps/server 下的空文件
 * - 交给 shared 的 parseEnv(ServerEnvSchema) 做字段级 Zod 校验
 * - 失败时打印每行错误并 process.exit(1)，避免带缺失配置启动
 */
export function loadServerEnv(): ServerEnv {
  dotenvFlow.config({ path: MONOREPO_ROOT, silent: true });
  try {
    return parseEnv(ServerEnvSchema, process.env);
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

/** DI token：通过 providers: [{ provide: SERVER_ENV, useValue }] 注入 */
export const SERVER_ENV = Symbol.for("SERVER_ENV");

export type { ServerEnv };
