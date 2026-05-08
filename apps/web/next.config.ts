import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// 加载 monorepo 根目录 .env.local（LLM API Key 等共享配置）
config({ path: resolve(__dirname, "../../.env.local") });

const nextConfig: NextConfig = {
  transpilePackages: ["@g-heal-claw/shared"],
  reactStrictMode: true,
};

export default nextConfig;
