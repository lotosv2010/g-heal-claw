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
    <html lang="zh-CN" suppressHydrationWarning>
      {/* 浏览器扩展（如 ColorZilla / Grammarly）会在客户端向 <body> 注入属性，
          导致 hydration 报文本结构一致但属性不匹配。这里仅关闭此警告，不影响实际行为。 */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
