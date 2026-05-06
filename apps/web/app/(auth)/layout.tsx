/**
 * 认证页面布局：居中卡片 + 渐变背景
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      {/* 渐变背景 */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950" />

      {/* 装饰性几何元素 */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-500/5" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-400/10 blur-3xl dark:bg-indigo-500/5" />
      </div>

      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
