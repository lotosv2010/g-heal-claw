import type { NextConfig } from "next";

// transpilePackages 让 Next.js 直接编译 workspace 源码，避免要求 SDK 先跑 build
const nextConfig: NextConfig = {
  transpilePackages: ["@g-heal-claw/sdk", "@g-heal-claw/shared"],
  reactStrictMode: true,
  // next build 时生成独立 .map 文件，用于上传到 Sourcemap 服务
  productionBrowserSourceMaps: true,
};

export default nextConfig;
