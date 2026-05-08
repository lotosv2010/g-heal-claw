import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { mkdir, readFile, writeFile, unlink, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

/**
 * 对象存储抽象
 *
 * 首版仅实现 S3/MinIO 兼容后端。后续切阿里 OSS / Cloudflare R2
 * 只需新增实现类并在 Module providers 替换。
 */
export interface StorageService {
  put(key: string, body: Buffer | Readable, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}

export const STORAGE_SERVICE = Symbol.for("STORAGE_SERVICE");

@Injectable()
export class S3StorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private client: S3Client | null = null;
  private readonly bucket: string;

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {
    this.bucket = env.MINIO_BUCKET_SOURCEMAPS ?? "sourcemaps";
  }

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") {
      this.logger.log("NODE_ENV=test，跳过 S3 初始化");
      return;
    }
    // MinIO 未配置时降级跳过，Sourcemap 上传/解析不可用
    if (!this.env.MINIO_ENDPOINT || !this.env.MINIO_ACCESS_KEY || !this.env.MINIO_SECRET_KEY) {
      this.logger.warn("MINIO_ENDPOINT / ACCESS_KEY / SECRET_KEY 未配置，Sourcemap 存储不可用");
      return;
    }
    this.client = new S3Client({
      endpoint: this.env.MINIO_ENDPOINT,
      region: this.env.MINIO_REGION,
      credentials: {
        accessKeyId: this.env.MINIO_ACCESS_KEY,
        secretAccessKey: this.env.MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // MinIO 必须
    });
    try {
      await this.ensureBucket();
    } catch (err) {
      // MinIO 不可达时降级，不阻塞 server 启动
      this.logger.warn(`MinIO 连接失败，Sourcemap 存储不可用：${(err as Error).message}`);
      this.client = null;
    }
  }

  public async put(
    key: string,
    body: Buffer | Readable,
    contentType = "application/octet-stream",
  ): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  public async get(key: string): Promise<Buffer | null> {
    if (!this.client) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  public async delete(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  public async deletePrefix(prefix: string): Promise<number> {
    if (!this.client) return 0;
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of list.Contents ?? []) {
        if (obj.Key) {
          await this.client.send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key }),
          );
          deleted++;
        }
      }
      continuationToken = list.IsTruncated
        ? list.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return deleted;
  }

  private async ensureBucket(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.bucket }),
      );
    } catch {
      this.logger.log(`Bucket "${this.bucket}" 不存在，正在创建...`);
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.bucket }),
      );
    }
  }
}

/**
 * 本地文件系统存储实现
 *
 * 将文件存储到 server 端本地目录（默认 apps/server/uploads/sourcemaps/）。
 * 适用于单机部署或开发环境，无需 MinIO/S3。
 */
@Injectable()
export class LocalStorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly baseDir: string;

  public constructor(
    @Inject(SERVER_ENV) private readonly env: ServerEnv,
  ) {
    this.baseDir = env.SOURCEMAP_LOCAL_DIR ?? join(process.cwd(), "uploads");
  }

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") return;
    await mkdir(this.baseDir, { recursive: true });
    this.logger.log(`本地存储目录: ${this.baseDir}`);
  }

  public async put(
    key: string,
    body: Buffer | Readable,
    _contentType?: string,
  ): Promise<void> {
    const filePath = join(this.baseDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    const buffer = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    await writeFile(filePath, buffer);
  }

  public async get(key: string): Promise<Buffer | null> {
    const filePath = join(this.baseDir, key);
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }

  public async delete(key: string): Promise<void> {
    const filePath = join(this.baseDir, key);
    try {
      await unlink(filePath);
    } catch {
      // 文件不存在时静默
    }
  }

  public async deletePrefix(prefix: string): Promise<number> {
    const dirPath = join(this.baseDir, prefix);
    try {
      const entries = await readdir(dirPath, { recursive: true });
      let deleted = 0;
      for (const entry of entries) {
        try {
          await unlink(join(dirPath, entry));
          deleted++;
        } catch {
          // 目录或已删除
        }
      }
      await rm(dirPath, { recursive: true, force: true });
      return deleted;
    } catch {
      return 0;
    }
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
