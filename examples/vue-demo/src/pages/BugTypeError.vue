<script setup lang="ts">
import { ref } from "vue";

const items = ref<string[]>([]);
const error = ref<string | null>(null);

interface ApiResponse {
  data: { items: string[] } | null;
}

/**
 * 模拟线上事故：后端接口约定返回 { data: { items: [...] } }，
 * 但某个边界条件下返回了 { data: null }，
 * 前端直接对 null 调用 .map() 导致 TypeError。
 * 
 * FIX: 添加空值检查，确保 data 不为 null 时才访问 items
 */
function triggerBug(): void {
  error.value = null;
  
  // 模拟后端返回异常结构
  const response: ApiResponse = { data: null };

  // FIX: 添加空值检查，避免 null 解引用
  if (!response.data) {
    error.value = "后端返回数据为空";
    console.error("API 返回异常: data 为 null");
    return;
  }
  
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
    <div v-if="error" class="error-message">
      错误已捕获: {{ error }}
    </div>
    <ul v-if="items.length">
      <li v-for="item in items" :key="item">{{ item }}</li>
    </ul>
  </div>
</template>

<style scoped>
.error-message {
  margin-top: 16px;
  padding: 12px;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
}
</style>
