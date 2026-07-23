# Admin CS：Electron → Tauri 设计锁定

**日期：** 2026-07-23  
**状态：** 已确认（可行性分析通过后立项）

## 目标

把 `@apps/admin` 的桌面端（`cs:*`）打包壳从 Electron 替换为 **Tauri 2**，缩小安装包与内存占用；**浏览器端 `bs:*` 与 `web.yml` 不变**。

## 已确认决策

| 项 | 决定 |
|----|------|
| 迁移主因 | 安装包体积 / 内存占用 |
| 路径 | A：直接替换 Electron，不双轨 |
| 首期平台 | Windows x64（NSIS 类安装包） |
| 工具链 | 接受本机 Rust + Windows WebView2；CS CI 可后补 |
| Tauri 版本 | 2.x |
| 丢弃能力 | `open-win` 子窗口、preload 全量 ipc（业务未用） |
| 保留壳能力 | 主窗口尺寸、应用菜单（关于/编辑/缩放/全屏/DevTools）、单实例、https 外链系统浏览器打开 |

## 边界

- **改：** `apps/admin` 构建脚本、Vite 插件分流、新增 `src-tauri/`、文档与 vue-admin 规则中的 Electron 表述
- **不改：** 业务 `src/views/**`、API、权限、路由；`bs:build` / GitHub `web.yml`
- **不做（首期）：** macOS 公证、Linux 包、自动更新 updater、业务能力下沉 Rust

## 架构

```
cs:dev  → tauri dev  → beforeDevCommand: vite (port 9596) → WebView2
cs:build → tauri build → beforeBuildCommand: vite build --mode production → bundle dist + Rust
bs:*    → 纯 Vite，无 Tauri / 无 Electron
```

## 成功标准

1. `pnpm --filter @apps/admin cs:build` 产出可安装的 Win x64 包，体积显著小于现 Electron 包
2. 登录、动态路由、导出、MQTT（若启用）、高德页冒烟通过
3. 外链系统浏览器打开；第二实例聚焦已有窗口
4. `bs:build` 无回归

## 实现计划

见 [`docs/superpowers/plans/2026-07-23-admin-cs-electron-to-tauri.md`](../plans/2026-07-23-admin-cs-electron-to-tauri.md)
