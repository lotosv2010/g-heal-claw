import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3StorageService } from "../../../src/modules/sourcemap/storage.service.js";
import type { ServerEnv } from "../../../src/config/env.js";

// vi.mock 会被提升到模块顶部，因此 mockSend 必须用 vi.hoisted 声明
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = mockSend;
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: class {},
    GetObjectCommand: class {},
    DeleteObjectCommand: class {},
    ListObjectsV2Command: class {},
    HeadBucketCommand: class {},
    CreateBucketCommand: class {},
  };
});

function makeEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    NODE_ENV: "development",
    MINIO_ENDPOINT: "http://localhost:9000",
    MINIO_REGION: "us-east-1",
    MINIO_ACCESS_KEY: "minioadmin",
    MINIO_SECRET_KEY: "minioadmin",
    MINIO_BUCKET_SOURCEMAPS: "sourcemaps",
    ...overrides,
  } as ServerEnv;
}

describe("S3StorageService", () => {
  let svc: S3StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new S3StorageService(makeEnv());
    // 手动触发 onModuleInit（mock S3Client 已注入）
    mockSend.mockResolvedValueOnce(undefined); // HeadBucket 成功
    return svc.onModuleInit();
  });

  it("put + get round-trip", async () => {
    const buf = Buffer.from("sourcemap-content");
    mockSend.mockResolvedValueOnce(undefined); // PutObject
    await svc.put("key/a.map", buf, "application/json");
    expect(mockSend).toHaveBeenCalledTimes(2); // HeadBucket + Put

    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array(buf) },
    });
    const result = await svc.get("key/a.map");
    expect(result).toEqual(buf);
  });

  it("get 返回 null 当 key 不存在", async () => {
    const noSuchKey = new Error("NoSuchKey");
    (noSuchKey as { name: string }).name = "NoSuchKey";
    mockSend.mockRejectedValueOnce(noSuchKey);
    const result = await svc.get("nonexistent");
    expect(result).toBeNull();
  });

  it("delete 不抛错", async () => {
    mockSend.mockResolvedValueOnce(undefined);
    await expect(svc.delete("key/a.map")).resolves.toBeUndefined();
  });

  it("deletePrefix 批量删除", async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [{ Key: "prefix/a.map" }, { Key: "prefix/b.map" }],
      IsTruncated: false,
    });
    mockSend.mockResolvedValue(undefined); // 两次 Delete
    const count = await svc.deletePrefix("prefix/");
    expect(count).toBe(2);
  });

  it("NODE_ENV=test 跳过初始化，所有方法安全返回", async () => {
    const testSvc = new S3StorageService(makeEnv({ NODE_ENV: "test" } as Partial<ServerEnv>));
    await testSvc.onModuleInit();
    await expect(testSvc.put("k", Buffer.from("x"))).resolves.toBeUndefined();
    expect(await testSvc.get("k")).toBeNull();
    await expect(testSvc.delete("k")).resolves.toBeUndefined();
    expect(await testSvc.deletePrefix("p/")).toBe(0);
  });
});
