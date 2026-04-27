import { defineConfig } from "vitest/config";

// SDK 运行在浏览器；单测使用 jsdom 以支持 window/document/localStorage
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
