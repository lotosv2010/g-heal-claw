import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "g-heal-claw 管理后台",
  description: "前端监控平台管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
