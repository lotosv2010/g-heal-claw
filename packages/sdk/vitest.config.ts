import { defineConfig } from "vitest/config";

// SDK 运行在浏览器；单测使用 jsdom 以支持 window/document/localStorage
// 测试文件集中在 tests/ 目录（coding.md 放置规则）
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.{test,spec}.ts"],
    globals: false,
  },
});
