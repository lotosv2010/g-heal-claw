<script setup lang="ts">
import { ref, defineComponent, h } from "vue";

const showCrashComponent = ref(false);

/**
 * 模拟线上事故：子组件在 setup 阶段抛出异常，
 * 父组件未使用 onErrorCaptured 保护，导致页面白屏。
 */
function triggerBug(): void {
  showCrashComponent.value = true;
}

// 会在 setup 阶段崩溃的子组件
const CrashChild = defineComponent({
  name: "CrashChild",
  setup() {
    // BUG: 访问不存在的全局服务，模拟第三方 SDK 未加载
    const service = (window as any).__ANALYTICS_SERVICE__;
    const userId = service.getCurrentUser().id;
    return () => h("div", `用户: ${userId}`);
  },
});
</script>

<template>
  <div class="bug-card">
    <h1>Bug: 渲染崩溃</h1>
    <p>
      模拟场景：子组件在 <code>setup()</code> 阶段访问了未定义的外部服务，
      抛出异常导致组件树渲染失败（白屏）。
    </p>
    <button class="btn" @click="triggerBug">💥 触发事故</button>
    <component :is="CrashChild" v-if="showCrashComponent" />
  </div>
</template>
