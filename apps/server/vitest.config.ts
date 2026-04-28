import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

// SWC 负责 TS + 装饰器元数据，保证 NestJS DI 在 vitest 里正确解析
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    // 测试文件集中在 tests/ 目录（coding.md 放置规则）
    include: ["tests/**/*.{spec,test}.ts"],
    globals: false,
  },
});
