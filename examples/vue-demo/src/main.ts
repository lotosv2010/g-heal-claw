import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { initGhc } from "./composables/use-ghc";

// 初始化监控 SDK
initGhc();

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("./pages/Home.vue") },
    { path: "/bug/undefined-access", component: () => import("./pages/BugUndefinedAccess.vue") },
    { path: "/bug/async-error", component: () => import("./pages/BugAsyncError.vue") },
    { path: "/bug/api-500", component: () => import("./pages/BugApi500.vue") },
    { path: "/bug/type-error", component: () => import("./pages/BugTypeError.vue") },
    { path: "/bug/render-crash", component: () => import("./pages/BugRenderCrash.vue") },
  ],
});

const app = createApp(App);
app.use(router);

// Vue 默认会拦截组件内异常不让其冒泡到 window，
// 这里重新抛出使 SDK 的 errorPlugin 能通过 window.onerror 捕获
app.config.errorHandler = (err, _instance, info) => {
  console.error(`[Vue Error] ${info}:`, err);
  // 重新抛出到全局，触发 SDK 捕获
  setTimeout(() => { throw err; }, 0);
};

app.mount("#app");
