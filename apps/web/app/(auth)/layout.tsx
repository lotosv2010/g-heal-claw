/**
 * 认证页面布局：居中卡片，背景保持苹果灰白底
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
