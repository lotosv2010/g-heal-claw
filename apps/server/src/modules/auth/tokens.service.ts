import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { generateProjectKeyId } from "@g-heal-claw/shared";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";
import { DatabaseService } from "../../shared/database/database.service.js";

export interface TokenListItem {
  readonly id: string;
  readonly publicKey: string;
  readonly secretKeyMasked: string;
  readonly label: string | null;
  readonly isActive: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
}

export interface TokenDetail extends TokenListItem {
  readonly secretKey: string;
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
    private readonly database: DatabaseService,
  ) {}

  private generateKey(prefix: string): string {
    return `${prefix}_${randomBytes(24).toString("base64url")}`;
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) return "****";
    return secret.slice(0, 8) + "****" + secret.slice(-4);
  }

  public async list(projectId: string): Promise<readonly TokenListItem[]> {
    const db = this.database.db;
    if (!db) return [];

    const rows = await db.execute<{
      id: string;
      public_key: string;
      secret_key: string;
      label: string | null;
      is_active: boolean;
      last_used_at: string | null;
      created_at: string;
    }>(sql`
      SELECT id, public_key, secret_key, label, is_active, last_used_at, created_at
      FROM project_keys
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);

    return rows.map((r) => ({
      id: r.id,
      publicKey: r.public_key,
      secretKeyMasked: this.maskSecret(r.secret_key),
      label: r.label,
      isActive: r.is_active,
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      createdAt: String(r.created_at),
    }));
  }

  public async create(
    projectId: string,
    label?: string,
  ): Promise<TokenDetail> {
    const db = this.database.db;
    if (!db) throw new NotFoundException("数据库不可用");

    const id = generateProjectKeyId();
    const publicKey = this.generateKey("pub");
    const secretKey = this.generateKey("sec");

    await db.execute(sql`
      INSERT INTO project_keys (id, project_id, public_key, secret_key, label, is_active, created_at)
      VALUES (${id}, ${projectId}, ${publicKey}, ${secretKey}, ${label ?? null}, true, NOW())
    `);

    return {
      id,
      publicKey,
      secretKey,
      secretKeyMasked: this.maskSecret(secretKey),
      label: label ?? null,
      isActive: true,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  public async toggleActive(
    projectId: string,
    tokenId: string,
    isActive: boolean,
  ): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(
      sql`UPDATE project_keys SET is_active = ${isActive}
          WHERE id = ${tokenId} AND project_id = ${projectId}
          RETURNING id`,
    );
    return rows.length > 0;
  }

  public async remove(projectId: string, tokenId: string): Promise<boolean> {
    const db = this.database.db;
    if (!db) return false;

    const rows = await db.execute<{ id: string }>(
      sql`DELETE FROM project_keys
          WHERE id = ${tokenId} AND project_id = ${projectId}
          RETURNING id`,
    );
    return rows.length > 0;
  }
}
