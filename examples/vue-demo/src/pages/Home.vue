<template>
  <div class="bug-card">
    <h1>G-Heal-Claw Vue Demo</h1>
    <p>
      本示例模拟真实线上事故场景。每个页面包含一个可触发的 Bug，
      SDK 会自动捕获异常并上报到后台。AI Agent 可对 Issue 进行自动诊断和修复。
    </p>
    <h3 style="margin-bottom: 8px; font-size: 14px;">事故场景列表</h3>
    <ul style="font-size: 13px; color: #a1a1aa; line-height: 2;">
      <li><strong>访问 undefined 属性</strong> — 常见的 Cannot read properties of undefined</li>
      <li><strong>异步未捕获异常</strong> — Promise rejection 未 catch</li>
      <li><strong>API 500 响应</strong> — 后端接口返回服务器错误</li>
      <li><strong>类型错误</strong> — 运行时类型不匹配导致 .map() 失败</li>
      <li><strong>渲染崩溃</strong> — 组件 setup 阶段抛出异常</li>
    </ul>
  </div>
</template>
