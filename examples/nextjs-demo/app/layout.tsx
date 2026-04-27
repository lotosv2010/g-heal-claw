import type { Metadata } from "next";
import "./globals.css";
import { GhcProvider } from "./ghc-provider";

export const metadata: Metadata = {
  title: "g-heal-claw SDK Demo",
  description: "接入 @g-heal-claw/sdk 的最小 Next.js 示例",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <GhcProvider>{children}</GhcProvider>
      </body>
    </html>
  );
}
