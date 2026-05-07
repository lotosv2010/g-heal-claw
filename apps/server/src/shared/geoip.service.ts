import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Reader, type ReaderModel } from "@maxmind/geoip2-node";
import { SERVER_ENV, type ServerEnv } from "../config/env.js";

export interface GeoResult {
  readonly country: string | null;
  readonly region: string | null;
  readonly city: string | null;
}

const EMPTY_GEO: GeoResult = { country: null, region: null, city: null };

/**
 * GeoIP 服务（T2.3.3）
 *
 * 加载 MaxMind GeoLite2-City.mmdb，按 IP 查询地域信息。
 * 文件不存在 / 加载失败时优雅降级为返回空结果。
 */
@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private reader: ReaderModel | null = null;

  public constructor(@Inject(SERVER_ENV) private readonly env: ServerEnv) {}

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") return;

    const dbPath = this.env.GEOIP_DB_PATH;
    try {
      this.reader = await Reader.open(dbPath);
      this.logger.log(`GeoIP database loaded: ${dbPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`GeoIP database not available (${dbPath}): ${msg} — 地域解析将跳过`);
    }
  }

  /** 根据 IP 查询地域（失败返回空，永不抛错） */
  public lookup(ip: string | undefined | null): GeoResult {
    if (!ip) return EMPTY_GEO;

    // 开发环境对私有 IP 返回默认地域（便于本地调试维度分布）
    if (isPrivateIp(ip)) {
      if (this.env.NODE_ENV !== "production") {
        return { country: "中国", region: "本地开发", city: "localhost" };
      }
      return EMPTY_GEO;
    }

    if (!this.reader) return EMPTY_GEO;

    try {
      const response = this.reader.city(ip);
      return {
        country: response.country?.names?.["zh-CN"] ?? response.country?.names?.en ?? null,
        region: response.subdivisions?.[0]?.names?.["zh-CN"] ?? response.subdivisions?.[0]?.names?.en ?? null,
        city: response.city?.names?.["zh-CN"] ?? response.city?.names?.en ?? null,
      };
    } catch {
      return EMPTY_GEO;
    }
  }
}

function isPrivateIp(ip: string): boolean {
  // 归一化 IPv4-mapped IPv6（Fastify trustProxy 下常见格式：::ffff:127.0.0.1）
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    ip === "::1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("172.16.") ||
    normalized.startsWith("172.17.") ||
    normalized.startsWith("172.18.") ||
    normalized.startsWith("172.19.") ||
    normalized.startsWith("172.2") ||
    normalized.startsWith("172.3") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}
