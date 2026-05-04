import { describe, it, expect, vi, beforeEach } from "vitest";
import { SourcemapController } from "../../../src/modules/sourcemap/sourcemap.controller.js";
import { ApiKeyGuard, type ApiKeyAuthedRequest } from "../../../src/modules/sourcemap/api-key.guard.js";
import type { DatabaseService } from "../../../src/shared/database/database.service.js";
import type { StorageService } from "../../../src/modules/sourcemap/storage.service.js";

function makeDbService(
  executeFn: (...args: unknown[]) => Promise<unknown[]> = async () => [],
): DatabaseService {
  return {
    db: {
      execute: executeFn,
    },
  } as unknown as DatabaseService;
}

function makeStorage(): StorageService {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    deletePrefix: vi.fn().mockResolvedValue(0),
  };
}

function makeReq(overrides: Partial<ApiKeyAuthedRequest> = {}): ApiKeyAuthedRequest {
  return {
    apiKeyAuth: { projectId: "proj_demo", secretKey: "sk_test" },
    headers: {},
    body: {},
    ...overrides,
  } as ApiKeyAuthedRequest;
}

function makeReply(): { code: ReturnType<typeof vi.fn>; statusCode: number } {
  const r = {
    statusCode: 200,
    code: vi.fn().mockImplementation((c: number) => {
      r.statusCode = c;
      return r;
    }),
  };
  return r;
}

describe("SourcemapController", () => {
  let controller: SourcemapController;
  let storage: StorageService;

  // --- createRelease ---
  describe("createRelease", () => {
    it("创建新 release 返回 201", async () => {
      const db = makeDbService(async () => []);
      storage = makeStorage();
      controller = new SourcemapController(db, storage);

      const req = makeReq({
        body: { version: "1.0.0", commitSha: "abc123" },
      });
      const result = await controller.createRelease(req);
      expect(result.data).toHaveProperty("version", "1.0.0");
      expect(result.data).toHaveProperty("projectId", "proj_demo");
      expect((result.data as { id: string }).id).toMatch(/^rel_/);
    });

    it("幂等：version 已存在时返回现有 release", async () => {
      const db = makeDbService(async () => [
        {
          id: "rel_exist",
          project_id: "proj_demo",
          version: "1.0.0",
          commit_sha: "abc",
          created_at: "2026-05-01T00:00:00Z",
        },
      ]);
      storage = makeStorage();
      controller = new SourcemapController(db, storage);

      const req = makeReq({ body: { version: "1.0.0" } });
      const result = await controller.createRelease(req);
      expect(result.data).toHaveProperty("id", "rel_exist");
    });
  });

  // --- listArtifacts ---
  describe("listArtifacts", () => {
    it("返回 release 下所有 artifacts", async () => {
      const db = makeDbService(async () => [
        {
          id: "art_aaa",
          filename: "main.js",
          map_filename: "main.js.map",
          file_size: 1024,
          created_at: "2026-05-01T00:00:00Z",
        },
        {
          id: "art_bbb",
          filename: "vendor.js",
          map_filename: "vendor.js.map",
          file_size: 2048,
          created_at: "2026-05-01T00:00:00Z",
        },
      ]);
      storage = makeStorage();
      controller = new SourcemapController(db, storage);

      const result = await controller.listArtifacts("rel_test", makeReq());
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toHaveProperty("filename", "main.js");
    });
  });

  // --- deleteRelease ---
  describe("deleteRelease", () => {
    it("删除 release 级联清理 storage", async () => {
      const executeFn = vi.fn().mockResolvedValue([]);
      const db = makeDbService(executeFn);
      storage = makeStorage();
      (storage.deletePrefix as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      controller = new SourcemapController(db, storage);

      await controller.deleteRelease("rel_del", makeReq());
      expect(storage.deletePrefix).toHaveBeenCalledWith(
        "sourcemaps/proj_demo/rel_del/",
      );
      // DB delete 被调用
      expect(executeFn).toHaveBeenCalled();
    });
  });

  // --- uploadArtifact ---
  describe("uploadArtifact", () => {
    it("filename 重复时 UPSERT 覆盖", async () => {
      const executeFn = vi.fn()
        .mockResolvedValueOnce([{ id: "rel_x" }]) // release check
        .mockResolvedValueOnce([]); // upsert
      const db = makeDbService(executeFn);
      storage = makeStorage();
      controller = new SourcemapController(db, storage);

      const fileBuffer = Buffer.from("sourcemap content");
      const req = {
        apiKeyAuth: { projectId: "proj_demo", secretKey: "sk" },
        parts: async function* () {
          yield { type: "field", fieldname: "filename", value: "app.js" };
          yield {
            type: "file",
            fieldname: "file",
            file: (async function* () {
              yield fileBuffer;
            })(),
          };
        },
      } as unknown as ApiKeyAuthedRequest;
      const reply = makeReply();

      const result = await controller.uploadArtifact(
        "rel_x",
        req,
        reply as never,
      );
      expect(storage.put).toHaveBeenCalled();
      expect(result.data).toHaveProperty("filename", "app.js");
      expect(result.data).toHaveProperty("mapFilename", "app.js.map");
    });
  });

  // --- ApiKeyGuard 401 ---
  describe("ApiKeyGuard", () => {
    it("缺少 X-Api-Key 返回 401", async () => {
      const db = makeDbService();
      const guard = new ApiKeyGuard(db);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      };
      await expect(
        guard.canActivate(mockContext as never),
      ).rejects.toThrow("X-Api-Key header 缺失或格式非法");
    });

    it("无效 API key 返回 401", async () => {
      const db = makeDbService(async () => []);
      const guard = new ApiKeyGuard(db);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { "x-api-key": "invalid_key_12345" },
          }),
        }),
      };
      await expect(
        guard.canActivate(mockContext as never),
      ).rejects.toThrow("API Key 无效或已禁用");
    });
  });
});
