import { defineConfig } from "vitest/config";

// 纯 Zod Schema + 常量包，单测跑在 Node 环境即可
export default defineConfig({
  test: {
    environment: "node",
    // 测试文件集中在 tests/ 目录（coding.md 放置规则）
    include: ["tests/**/*.{test,spec}.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
    },
  },
});
