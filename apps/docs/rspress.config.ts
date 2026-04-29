import * as path from "node:path";
import { defineConfig } from "rspress/config";

// 面向终端用户的操作手册（ADR-0022）
// 与 docs/*.md（给 AI 编程工具的工程上下文）严格分离：此站点聚焦"如何使用产品"
export default defineConfig({
  root: path.join(__dirname, "docs"),
  title: "g-heal-claw",
  description:
    "自愈型前端监控平台用户手册：接入、使用、排查与最佳实践",
  globalStyles: path.join(__dirname, "docs", "styles", "override.css"),
  icon: "/logo.svg",
  logo: {
    light: "/logo.svg",
    dark: "/logo.svg",
  },
  logoText: "g-heal-claw",
  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/lotosv2010/g-heal-claw",
      },
    ],
    nav: [
      { text: "快速开始", link: "/quickstart/" },
      { text: "入门指南", link: "/guide/introduction" },
      { text: "接口说明", link: "/reference/" },
      { text: "SDK 说明", link: "/sdk/installation" },
    ],
    sidebar: {
      "/quickstart/": [
        {
          text: "快速开始",
          items: [
            { text: "5 分钟上手", link: "/quickstart/" },
          ],
        },
      ],
      "/guide/": [
        {
          text: "产品介绍",
          items: [
            { text: "产品简介", link: "/guide/introduction" },
            { text: "菜单总览", link: "/guide/dashboard-overview" },
          ],
        },
        {
          text: "使用指南",
          items: [
            { text: "异常分析", link: "/guide/errors" },
            { text: "页面性能", link: "/guide/performance" },
            { text: "API 监控", link: "/guide/api" },
            { text: "静态资源", link: "/guide/resources" },
            { text: "访问分析", link: "/guide/visits" },
            { text: "埋点分析", link: "/guide/tracking" },
            { text: "系统设置", link: "/guide/settings" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "指标字典",
          items: [
            { text: "总览", link: "/reference/" },
            { text: "页面性能指标", link: "/reference/performance-metrics" },
            { text: "导航瀑布图时间节点", link: "/reference/navigation-timing" },
            { text: "异常分析指标", link: "/reference/error-metrics" },
            { text: "API 监控指标", link: "/reference/api-metrics" },
            { text: "访问分析指标", link: "/reference/visits-metrics" },
          ],
        },
      ],
      "/sdk/": [
        {
          text: "SDK 使用",
          items: [
            { text: "安装与初始化", link: "/sdk/installation" },
            { text: "异常监控", link: "/sdk/error" },
            { text: "性能监控", link: "/sdk/performance" },
            { text: "API 监控", link: "/sdk/api" },
            { text: "静态资源监控", link: "/sdk/resources" },
            { text: "埋点上报", link: "/sdk/tracking" },
            { text: "Sourcemap 上传", link: "/sdk/sourcemap" },
          ],
        },
      ],
    },
    footer: {
      message: "MIT Licensed · Built with Rspress",
    },
  },
});
