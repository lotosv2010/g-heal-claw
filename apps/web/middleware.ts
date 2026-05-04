import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js middleware：认证保护
 *
 * 策略：
 *  - cookie `ghc-auth=1` 存在 → 放行（token 有效性由前端 httpClient 401 拦截器处理）
 *  - 不存在 + 访问受保护路由 → 302 → /login?from=<原路径>
 *  - /login、/register 路径本身总是放行
 */

const AUTH_COOKIE_NAME = "ghc-auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 放行：认证页面本身、静态资源、Next.js 内部路径
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 检查认证 cookie
  const authCookie = req.cookies.get(AUTH_COOKIE_NAME);
  if (authCookie?.value === "1") {
    return NextResponse.next();
  }

  // 未登录 → 重定向到登录页，保留原路径供登录后返回
  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("from", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

// 匹配所有路由（除了 matcher 配置中排除的静态资源）
export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
