import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

// SDK 构建：Vite Library Mode（ADR-0010）
// - ESM 供 bundler；UMD 供 CDN <script>（挂 window.GHealClaw）
// - 类型声明由 vite-plugin-dts 产出到 dist/index.d.ts
// - 浏览器目标：零 Node.js API；bundle shared 进产物避免消费方再装 zod
export default defineConfig({
  build: {
    target: "es2020",
    sourcemap: true,
    minify: "esbuild",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "GHealClaw",
      formats: ["es", "umd"],
      fileName: (format) => (format === "es" ? "sdk.esm.js" : "sdk.umd.cjs"),
    },
    rollupOptions: {
      // shared 与 zod 打进 SDK：让接入方无需再装 zod；单源事件契约
      external: [],
      output: {
        globals: {},
        exports: "named",
      },
    },
  },
  plugins: [
    dts({
      entryRoot: "src",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      rollupTypes: true,
      tsconfigPath: "./tsconfig.json",
    }),
  ],
});
