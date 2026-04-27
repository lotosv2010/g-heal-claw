/**
 * Session 管理（SPEC §3.3.5 精简版）
 *
 * 骨架只负责生成与读取 sessionId；跨标签页同步 / 30min 失效 留给后续任务。
 */

const KEY_PREFIX = "_ghc_session_";

function uuid(): string {
  // 浏览器 / jsdom / Node 18+ 均提供 crypto.randomUUID
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // 退化实现：足够用于冒烟
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/**
 * 获取或创建当前 projectId 的 sessionId
 *
 * 存于 localStorage（Web / jsdom）；无 localStorage 时退化为一次性内存值。
 */
export function ensureSessionId(projectId: string): string {
  const key = `${KEY_PREFIX}${projectId}`;
  try {
    if (typeof localStorage !== "undefined") {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const fresh = uuid();
      localStorage.setItem(key, fresh);
      return fresh;
    }
  } catch {
    // localStorage 不可用（隐私模式 / SSR），退化
  }
  return uuid();
}
