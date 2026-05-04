import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * 根路径路由：登录态 → /monitor/performance；未登录 → /login
 */
export default async function RootPage(): Promise<never> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get("ghc-auth");
  if (authCookie?.value === "1") {
    redirect("/monitor/performance");
  }
  redirect("/login");
}
