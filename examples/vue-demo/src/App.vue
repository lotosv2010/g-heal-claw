<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app">
    <nav class="sidebar">
      <h2>🐛 线上事故模拟</h2>
      <p class="desc">点击触发事故 → Dashboard 观测 → AI 自动修复</p>
      <ul>
        <li><RouterLink to="/">首页</RouterLink></li>
        <li><RouterLink to="/bug/undefined-access">Bug: 访问 undefined 属性</RouterLink></li>
        <li><RouterLink to="/bug/async-error">Bug: 异步未捕获异常</RouterLink></li>
        <li><RouterLink to="/bug/api-500">Bug: API 500 响应</RouterLink></li>
        <li><RouterLink to="/bug/type-error">Bug: 类型错误</RouterLink></li>
        <li><RouterLink to="/bug/render-crash">Bug: 渲染崩溃</RouterLink></li>
      </ul>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f10; color: #e4e4e7; }
.app { display: flex; min-height: 100vh; }
.sidebar { width: 280px; padding: 24px; border-right: 1px solid #27272a; background: #18181b; }
.sidebar h2 { font-size: 16px; margin-bottom: 8px; }
.sidebar .desc { font-size: 12px; color: #71717a; margin-bottom: 20px; }
.sidebar ul { list-style: none; }
.sidebar li { margin-bottom: 4px; }
.sidebar a { display: block; padding: 8px 12px; border-radius: 6px; color: #a1a1aa; text-decoration: none; font-size: 13px; transition: all 0.15s; }
.sidebar a:hover { background: #27272a; color: #fff; }
.sidebar a.router-link-active { background: #3b82f6; color: #fff; }
.content { flex: 1; padding: 32px; }
.bug-card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 24px; max-width: 600px; }
.bug-card h1 { font-size: 18px; margin-bottom: 8px; }
.bug-card p { font-size: 13px; color: #71717a; margin-bottom: 16px; }
.bug-card code { background: #27272a; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #f87171; }
.btn { display: inline-block; padding: 10px 20px; border: none; border-radius: 8px; background: #dc2626; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.btn:hover { background: #b91c1c; transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.result { margin-top: 16px; padding: 12px; background: #1c1917; border: 1px solid #44403c; border-radius: 8px; font-family: monospace; font-size: 12px; color: #fbbf24; white-space: pre-wrap; }
</style>
