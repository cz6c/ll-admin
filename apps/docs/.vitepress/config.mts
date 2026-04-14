import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ll-admin 开发文档",
  description: "admin + server 前后端开发与使用说明",
  lang: "zh-CN",
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    siteTitle: "ll-admin Docs",
    nav: [
      { text: "首页", link: "/" },
      { text: "快速开始", link: "/guide/getting-started" },
      { text: "后端", link: "/guide/server" },
      { text: "前端", link: "/guide/admin" },
      { text: "联调主线", link: "/guide/full-link" },
      { text: "部署", link: "/guide/deployment" }
    ],
    sidebar: [
      {
        text: "开始使用",
        items: [
          { text: "文档首页", link: "/" },
          { text: "从 0 到 1 快速开始", link: "/guide/getting-started" },
          { text: "项目总览", link: "/guide/project-overview" }
        ]
      },
      {
        text: "开发指南",
        items: [
          { text: "后端 server 开发", link: "/guide/server" },
          { text: "前端 admin 开发", link: "/guide/admin" },
          { text: "前后端联调主线", link: "/guide/full-link" },
          { text: "部署指南", link: "/guide/deployment" }
        ]
      },
      {
        text: "补充说明",
        items: [
          { text: "核心功能地图", link: "/guide/feature-map" },
          { text: "常见问题", link: "/guide/faq" }
        ]
      }
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/cz6c/ll-admin" }],
    footer: {
      message: "基于 VitePress 构建",
      copyright: "Copyright © ll-admin"
    },
    outline: {
      level: [2, 3]
    },
    search: {
      provider: "local"
    }
  }
});
