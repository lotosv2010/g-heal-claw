<script setup lang="ts">
import { ref } from "vue";

const result = ref("");
const loading = ref(false);

/**
 * 模拟线上事故：请求后端接口返回 500，
 * 前端未检查 response.ok 直接解析 body 导致报错。
 */
async function triggerBug(): Promise<void> {
  loading.value = true;
  result.value = "";

  try {
    // 请求一个不存在的接口，触发 500/404
    const response = await fetch("/api/v1/non-existent-endpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "crash" }),
    });

    // BUG: 未检查 response.ok，直接当成功处理
    const data = await response.json();
    result.value = `订单号: ${data.orderId}`;
  } catch (err) {
    // 即使 catch 了，错误已被 SDK 的 httpPlugin 捕获
    result.value = `请求失败: ${(err as Error).message}`;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="bug-card">
    <h1>Bug: API 500 响应</h1>
    <p>
      模拟场景：前端调用后端接口返回 500 状态码，
      <code>httpPlugin</code> 自动捕获 HTTP 错误并上报。
    </p>
    <button class="btn" :disabled="loading" @click="triggerBug">
      {{ loading ? "请求中..." : "💥 触发事故" }}
    </button>
    <div v-if="result" class="result">{{ result }}</div>
  </div>
</template>
