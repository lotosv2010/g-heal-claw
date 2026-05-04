import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { generateUserId } from "@g-heal-claw/shared";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";
import { RedisService } from "../../shared/redis/redis.service.js";
import type { UserProfile } from "./dto/auth-response.dto.js";

export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: string;
}

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  // ---- 注册 ----
  public async register(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<{ tokens: TokenPair; user: UserProfile }> {
    const db = this.database.db;
    if (!db) {
      throw new UnauthorizedException("数据库不可用");
    }

    const existing = await db.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`,
    );
    if (existing.length > 0) {
      throw new ConflictException({
        error: "EMAIL_EXISTS",
        message: "该邮箱已注册",
      });
    }

    const id = generateUserId();
    const passwordHash = await bcrypt.hash(password, this.env.BCRYPT_ROUNDS);
    const now = new Date().toISOString();

    // dev/test 环境：新用户默认 admin，便于访问 dev seed 的 demo 项目
    const defaultRole = this.env.NODE_ENV === "production" ? "user" : "admin";
    await db.execute(sql`
      INSERT INTO users (id, email, password_hash, display_name, role, is_active, created_at, updated_at)
      VALUES (${id}, ${email}, ${passwordHash}, ${displayName ?? null}, ${defaultRole}, true, NOW(), NOW())
    `);

    const tokens = this.signTokens({ sub: id, email, role: defaultRole });
    await this.storeRefreshToken(tokens.refreshToken, {
      sub: id,
      email,
      role: "user",
    });

    return {
      tokens,
      user: {
        id,
        email,
        displayName: displayName ?? null,
        role: "user",
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
      },
    };
  }

  // ---- 登录 ----
  public async login(
    email: string,
    password: string,
  ): Promise<{ tokens: TokenPair; user: UserProfile }> {
    const db = this.database.db;
    if (!db) {
      throw new UnauthorizedException("数据库不可用");
    }

    const result = await db.execute<{
      id: string;
      email: string;
      password_hash: string;
      display_name: string | null;
      role: string;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      sql`SELECT id, email, password_hash, display_name, role, is_active, last_login_at, created_at
          FROM users WHERE email = ${email} AND is_active = true LIMIT 1`,
    );

    if (result.length === 0) {
      throw new UnauthorizedException({
        error: "INVALID_CREDENTIALS",
        message: "邮箱或密码错误",
      });
    }

    const row = result[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        error: "INVALID_CREDENTIALS",
        message: "邮箱或密码错误",
      });
    }

    // 更新 last_login_at
    await db.execute(
      sql`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ${row.id}`,
    );

    const payload: JwtPayload = {
      sub: row.id,
      email: row.email,
      role: row.role,
    };
    const tokens = this.signTokens(payload);
    await this.storeRefreshToken(tokens.refreshToken, payload);

    return {
      tokens,
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isActive: row.is_active,
        lastLoginAt: new Date().toISOString(),
        createdAt: String(row.created_at),
      },
    };
  }

  // ---- 刷新 ----
  public async refresh(refreshToken: string): Promise<TokenPair> {
    const stored = await this.getRefreshTokenData(refreshToken);
    if (!stored) {
      throw new UnauthorizedException({
        error: "INVALID_REFRESH_TOKEN",
        message: "Refresh token 无效或已过期",
      });
    }

    // 轮换：旧 token 立即失效
    await this.revokeRefreshToken(refreshToken);

    const payload: JwtPayload = {
      sub: stored.sub,
      email: stored.email,
      role: stored.role,
    };
    const newTokens = this.signTokens(payload);
    await this.storeRefreshToken(newTokens.refreshToken, payload);

    return newTokens;
  }

  // ---- 登出 ----
  public async logout(refreshToken: string): Promise<void> {
    await this.revokeRefreshToken(refreshToken);
  }

  // ---- 获取当前用户 ----
  public async getMe(userId: string): Promise<UserProfile | null> {
    const db = this.database.db;
    if (!db) return null;

    const result = await db.execute<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      sql`SELECT id, email, display_name, role, is_active, last_login_at, created_at
          FROM users WHERE id = ${userId} AND is_active = true LIMIT 1`,
    );

    if (result.length === 0) return null;
    const row = result[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
      createdAt: String(row.created_at),
    };
  }

  // ---- JWT 验证（供 Guard 调用）----
  public verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.env.JWT_SECRET) as JwtPayload & {
        iat: number;
        exp: number;
      };
      return { sub: decoded.sub, email: decoded.email, role: decoded.role };
    } catch {
      throw new UnauthorizedException({
        error: "INVALID_TOKEN",
        message: "Access token 无效或已过期",
      });
    }
  }

  // ---- 内部：签发 token 对 ----
  private signTokens(payload: JwtPayload): TokenPair {
    const accessToken = jwt.sign(payload, this.env.JWT_SECRET, {
      expiresIn: this.parseDurationToSeconds(this.env.JWT_EXPIRES_IN),
      jwtid: randomUUID(),
    });
    const refreshToken = jwt.sign(payload, this.env.REFRESH_TOKEN_SECRET, {
      expiresIn: this.parseDurationToSeconds(this.env.REFRESH_TOKEN_EXPIRES_IN),
      jwtid: randomUUID(),
    });
    return { accessToken, refreshToken };
  }

  // ---- 内部：Refresh token Redis 存储 ----
  private refreshTokenKey(token: string): string {
    const hash = createHash("sha256").update(token).digest("hex");
    return `auth:refresh:${hash}`;
  }

  private async storeRefreshToken(
    token: string,
    payload: JwtPayload,
  ): Promise<void> {
    const client = this.redis.client;
    if (!client) return;
    const key = this.refreshTokenKey(token);
    const ttl = this.parseDurationToSeconds(this.env.REFRESH_TOKEN_EXPIRES_IN);
    await client.set(key, JSON.stringify(payload), "EX", ttl);
  }

  private async getRefreshTokenData(
    token: string,
  ): Promise<JwtPayload | null> {
    const client = this.redis.client;
    if (!client) return null;
    const key = this.refreshTokenKey(token);
    const data = await client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as JwtPayload;
    } catch {
      return null;
    }
  }

  private async revokeRefreshToken(token: string): Promise<void> {
    const client = this.redis.client;
    if (!client) return;
    const key = this.refreshTokenKey(token);
    await client.del(key);
  }

  // 将 "7d" / "1h" / "900s" 转为秒数
  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m|h|d|w|y)$/i);
    if (!match) return 604800; // 默认 7d
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      ms: 0.001,
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
      y: 31536000,
    };
    return Math.ceil(value * (multipliers[unit] ?? 1));
  }
}
