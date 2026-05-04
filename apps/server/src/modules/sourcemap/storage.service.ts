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
import { SERVER_ENV, type ServerEnv } from "../../config/env.js";

/**
 * 对象存储抽象（DESIGN §9.4 · ADR-0031）
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
    this.bucket = env.MINIO_BUCKET_SOURCEMAPS;
  }

  public async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === "test") {
      this.logger.log("NODE_ENV=test，跳过 S3 初始化");
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
    await this.ensureBucket();
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
