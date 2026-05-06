"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiLogin, AuthApiError } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiLogin(email, password);
      const from = searchParams.get("from");
      router.push(from ?? "/monitor/performance");
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message || "登录失败，请检查邮箱和密码");
      } else {
        setError("网络错误，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Logo 与标题 */}
      <div className="text-center space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 dark:shadow-blue-500/20">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          G-Heal-Claw
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          前端监控与自愈平台
        </p>
      </div>

      {/* 登录卡片 */}
      <Card className="shadow-xl border-slate-200/60 dark:border-slate-800">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl font-semibold">欢迎回来</CardTitle>
          <CardDescription>使用邮箱和密码登录管理后台</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {reason === "session_expired" && !error && (
              <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>登录已过期，请重新登录</span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-400">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                邮箱
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                密码
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="输入密码"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30 dark:shadow-blue-500/20"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  登录中
                </span>
              ) : (
                "登录"
              )}
            </Button>
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              还没有账号？{" "}
              <Link
                href="/register"
                className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                立即注册
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
