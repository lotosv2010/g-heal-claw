<script setup lang="ts">
import { ref } from "vue";

const items = ref<string[]>([]);

interface ApiResponse {
  data: { items: string[] };
}

/**
 * 模拟线上事故：后端接口约定返回 { data: { items: [...] } }，
 * 但某个边界条件下返回了 { data: null }，
 * 前端直接对 null 调用 .map() 导致 TypeError。
 */
function triggerBug(): void {
  // 模拟后端返回异常结构
  const response: ApiResponse = { data: null as any };

  // BUG: data 为 null，.items 为 undefined，调用 .map() 崩溃
  items.value = response.data.items.map((item: string) => item.toUpperCase());
}
</script>

<template>
  <div class="bug-card">
    <h1>Bug: 类型错误</h1>
    <p>
      模拟场景：后端约定返回 <code>{ data: { items: [...] } }</code>，
      但边界条件返回了 <code>{ data: null }</code>，前端直接 <code>.items.map()</code> 崩溃。
    </p>
    <button class="btn" @click="triggerBug">💥 触发事故</button>
    <ul v-if="items.length">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </div>
</template>
