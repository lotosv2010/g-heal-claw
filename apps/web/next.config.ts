import type { NextConfig } from "next";

// 通过 transpilePackages 直接编译 workspace 源码，避免依赖 shared 先 build
const nextConfig: NextConfig = {
  transpilePackages: ["@g-heal-claw/shared"],
  reactStrictMode: true,
};

export default nextConfig;
