import { parseDsn } from "./dsn.js";
import { createLogger } from "./logger.js";
import { resolveOptions, type GHealClawOptions } from "./options.js";
import { createTransport } from "./transport/index.js";
import {
  createHub,
  getCurrentHub,
  setCurrentHub,
  type Hub,
} from "./hub.js";
import { PluginRegistry, type Plugin } from "./plugin.js";
import { ensureSessionId } from "./session.js";

interface InitExtras {
  /** 注入自定义插件（可选） */
  readonly plugins?: readonly Plugin[];
}

/**
 * SDK 初始化入口（SPEC §3.1）
 *
 * 失败场景：
 * - dsn 非法 → 打 warn，SDK 进入 no-op 状态（不会抛错）
 * - 重复 init → 打 warn 但允许覆盖，便于热重载
 */
export function init(
  options: GHealClawOptions,
  extras: InitExtras = {},
): Hub | null {
  const resolved = resolveOptions(options);
  const logger = createLogger(resolved.debug);

  const dsn = parseDsn(options.dsn);
  if (!dsn) {
    logger.warn("DSN 无效，SDK 已进入 no-op", options.dsn);
    return null;
  }

  if (getCurrentHub()) {
    logger.warn("SDK 已初始化，覆盖旧 Hub");
  }

  const transport = createTransport({
    endpoint: dsn.ingestUrl,
    beaconEndpoint: dsn.ingestUrl.replace("/events", "/beacon"),
    dsn: options.dsn,
    logger,
    maxBatchSize: options.maxBatchSize ?? 30,
    flushIntervalMs: options.flushInterval ?? 5000,
    preferredChannel: options.transport ?? "auto",
  });

  const sessionId = ensureSessionId(dsn.projectId);

  const hub = createHub({
    dsn,
    options: resolved,
    logger,
    transport,
    sessionId,
  });

  const registry = new PluginRegistry();
  for (const plugin of extras.plugins ?? []) {
    registry.register(plugin, logger);
  }
  registry.setupAll(hub, options);

  setCurrentHub(hub);
  logger.debug("SDK 已初始化", {
    projectId: dsn.projectId,
    environment: resolved.environment,
    release: resolved.release,
  });
  return hub;
}
