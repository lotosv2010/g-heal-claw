import type { Hub } from "./hub.js";
import type { GHealClawOptions } from "./options.js";

/**
 * SDK 插件接口
 *
 * 约定：
 * - name 全局唯一；重复注册后者生效并打 warn
 * - setup 同步执行；内部失败必须 try/catch 吞错（由 PluginRegistry 兜底）
 * - 插件可通过 `hub.addBreadcrumb` / 后续 `hub.captureEvent` 主动写事件
 */
export interface Plugin {
  readonly name: string;
  setup(hub: Hub, options: GHealClawOptions): void;
}

/**
 * 运行时插件注册表
 *
 * 每次 `init` 时新建一份；插件隔离在 Registry 内。
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, Plugin>();

  public register(plugin: Plugin, logger: Hub["logger"]): void {
    if (this.plugins.has(plugin.name)) {
      logger.warn(`插件 ${plugin.name} 重复注册，后者覆盖`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  public setupAll(hub: Hub, options: GHealClawOptions): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.setup(hub, options);
      } catch (err) {
        // 单个插件失败不影响其他插件；SDK 对宿主必须透明
        hub.logger.error(`插件 ${plugin.name} setup 失败`, err);
      }
    }
  }

  public list(): readonly Plugin[] {
    return [...this.plugins.values()];
  }
}
