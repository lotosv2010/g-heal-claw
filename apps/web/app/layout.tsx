import type { Metadata } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "g-heal-claw 管理后台",
  description: "前端监控平台管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 阻塞式内联脚本：水合前根据 localStorage / 系统偏好写入 .dark，消除首屏闪白 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* 浏览器扩展（如 ColorZilla / Grammarly）会在客户端向 <body> 注入属性，
          导致 hydration 报文本结构一致但属性不匹配。这里仅关闭此警告，不影响实际行为。 */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
