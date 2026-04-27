import type { SdkEvent } from "@g-heal-claw/shared";

/**
 * SDK 初始化选项（SPEC §3.1）
 *
 * 骨架仅消费 dsn / release / environment / debug 等核心字段；
 * 采样率 / beforeSend / ignoreErrors 等留给 T1.2.7。
 */
export interface GHealClawOptions {
  readonly dsn: string;
  readonly release?: string;
  readonly environment?: string;
  readonly sampleRate?: number;
  readonly errorSampleRate?: number;
  readonly performanceSampleRate?: number;
  readonly tracingSampleRate?: number;
  readonly maxBreadcrumbs?: number;
  readonly maxBatchSize?: number;
  readonly flushInterval?: number;
  readonly transport?: "beacon" | "fetch" | "image" | "auto";
  readonly enablePerformance?: boolean;
  readonly enableApiTracking?: boolean;
  readonly enableResourceTracking?: boolean;
  readonly enablePageView?: boolean;
  readonly enableAutoTrack?: boolean;
  readonly enableWhiteScreenDetect?: boolean;
  readonly slowApiThreshold?: number;
  readonly ignoreErrors?: readonly (string | RegExp)[];
  readonly ignoreUrls?: readonly (string | RegExp)[];
  readonly beforeSend?: (event: SdkEvent) => SdkEvent | null;
  readonly debug?: boolean;
}

/**
 * 应用默认值后的有效选项（仅骨架关心的字段）
 */
export interface ResolvedOptions {
  readonly dsn: string;
  readonly release?: string;
  readonly environment: string;
  readonly maxBreadcrumbs: number;
  readonly debug: boolean;
}

export function resolveOptions(options: GHealClawOptions): ResolvedOptions {
  return {
    dsn: options.dsn,
    release: options.release,
    environment: options.environment ?? "production",
    maxBreadcrumbs: options.maxBreadcrumbs ?? 100,
    debug: options.debug ?? false,
  };
}
