import type { NextConfig } from "next";

// transpilePackages 让 Next.js 直接编译 workspace 源码，避免要求 SDK 先跑 build
const nextConfig: NextConfig = {
  transpilePackages: ["@g-heal-claw/sdk", "@g-heal-claw/shared"],
  reactStrictMode: true,
};

export default nextConfig;
