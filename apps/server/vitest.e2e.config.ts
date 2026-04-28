import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    // 测试文件集中在 tests/ 目录（coding.md 放置规则）
    include: ["tests/**/*.e2e-spec.ts"],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
