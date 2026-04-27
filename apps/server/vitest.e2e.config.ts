import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
