/**
 * 内部日志器
 *
 * 仅当 options.debug=true 时打印；错误分支也不抛出，保证 SDK 对宿主页面透明。
 */
export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function createLogger(debug: boolean): Logger {
  const prefix = "[g-heal-claw]";
  return {
    debug(...args) {
      if (debug) console.debug(prefix, ...args);
    },
    warn(...args) {
      console.warn(prefix, ...args);
    },
    error(...args) {
      console.error(prefix, ...args);
    },
  };
}
