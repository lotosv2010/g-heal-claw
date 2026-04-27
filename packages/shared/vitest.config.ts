import { defineConfig } from "vitest/config";

// 纯 Zod Schema + 常量包，单测跑在 Node 环境即可
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/index.ts"],
    },
  },
});
