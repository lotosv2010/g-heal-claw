import type { Breadcrumb, UserContext } from "@g-heal-claw/shared";
import type { ParsedDsn } from "./dsn.js";
import type { ResolvedOptions } from "./options.js";
import type { Logger } from "./logger.js";
import type { Transport } from "./transport/types.js";

/**
 * Scope：SDK 运行时的用户/标签/上下文/面包屑集合
 *
 * 模块级单例，通过 `getCurrentHub()` 暴露；测试可 `resetHub()` 重置。
 */
export interface Scope {
  user?: UserContext;
  tags: Record<string, string>;
  context: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
}

function createEmptyScope(): Scope {
  return { tags: {}, context: {}, breadcrumbs: [] };
}

/**
 * Hub：SDK 的运行时状态容器
 *
 * 持有已解析的 DSN、Transport、Logger、Scope 与配置；
 * 插件通过 `hub.addBreadcrumb` / `hub.captureEvent` 等 API 写入事件。
 */
export interface Hub {
  readonly dsn: ParsedDsn;
  readonly options: ResolvedOptions;
  readonly logger: Logger;
  readonly transport: Transport;
  readonly scope: Scope;
  readonly sessionId: string;
  setUser(user: UserContext | undefined): void;
  setTag(key: string, value: string): void;
  setContext(key: string, value: Record<string, unknown>): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
  getScopeSnapshot(): Readonly<Scope>;
}

export function createHub(params: {
  dsn: ParsedDsn;
  options: ResolvedOptions;
  logger: Logger;
  transport: Transport;
  sessionId: string;
}): Hub {
  const scope = createEmptyScope();
  const { options, logger } = params;

  return {
    dsn: params.dsn,
    options,
    logger,
    transport: params.transport,
    scope,
    sessionId: params.sessionId,
    setUser(user) {
      scope.user = user;
    },
    setTag(key, value) {
      scope.tags[key] = value;
    },
    setContext(key, value) {
      scope.context[key] = value;
    },
    addBreadcrumb(breadcrumb) {
      scope.breadcrumbs.push(breadcrumb);
      // 环形缓冲：超过 maxBreadcrumbs 丢弃最旧
      const overflow = scope.breadcrumbs.length - options.maxBreadcrumbs;
      if (overflow > 0) scope.breadcrumbs.splice(0, overflow);
    },
    getScopeSnapshot() {
      return scope;
    },
  };
}

// -------- 模块级单例管理 --------

let currentHub: Hub | null = null;

export function setCurrentHub(hub: Hub): void {
  currentHub = hub;
}

export function getCurrentHub(): Hub | null {
  return currentHub;
}

/** 测试用：清空单例与 Scope */
export function resetHub(): void {
  currentHub = null;
}
