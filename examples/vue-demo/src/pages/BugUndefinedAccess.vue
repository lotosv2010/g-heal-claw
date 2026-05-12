<script setup lang="ts">
import { ref } from "vue";

const result = ref("");

interface UserProfile {
  name: string;
  address?: {
    city: string;
    zip: string;
  };
}

/**
 * 模拟线上事故：从后端获取的用户数据缺少 address 字段，
 * 直接访问 user.address.city 导致 TypeError。
 * 这是生产环境中最常见的空指针异常之一。
 */
function triggerBug(): void {
  const user: UserProfile = { name: "张三" };
  // FIX: 使用可选链操作符安全访问嵌套属性
  const city = user.address?.city ?? "未知城市";
  result.value = `用户城市: ${city}`;
}
</script>

<template>
  <div class="bug-card">
    <h1>Bug: 访问 undefined 属性</h1>
    <p>
      模拟场景：后端返回的用户数据缺少 <code>address</code> 字段，
      前端未做空值检查直接访问 <code>user.address.city</code>。
    </p>
    <button class="btn" @click="triggerBug">💥 触发事故</button>
    <div v-if="result" class="result">{{ result }}</div>
  </div>
</template>
