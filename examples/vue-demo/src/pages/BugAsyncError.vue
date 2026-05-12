<script setup lang="ts">
import { ref } from "vue";

const loading = ref(false);
const error = ref<string | null>(null);

/**
 * 模拟线上事故：异步函数中抛出异常但未被 catch，
 * 导致 Unhandled Promise Rejection。
 * 常见于忘记 try-catch 的网络请求或定时器回调。
 */
async function triggerBug(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    // BUG: 这里模拟一个异步操作失败后直接 throw，没有 catch
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 模拟 JSON 解析失败
    const malformedJson = "{ invalid json !!!";
    JSON.parse(malformedJson);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    console.error("捕获到异常:", e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="bug-card">
    <h1>Bug: 异步未捕获异常</h1>
    <p>
      模拟场景：异步请求返回畸形数据，<code>JSON.parse</code> 抛出
      SyntaxError，但调用方没有 try-catch。
    </p>
    <button class="btn" :disabled="loading" @click="triggerBug">
      {{ loading ? "执行中..." : "💥 触发事故" }}
    </button>
    <div v-if="error" class="error-message">
      已捕获错误: {{ error }}
    </div>
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
