/**
 * Vite 插件组装
 * 职责：统一注册 Vue/自动导入/UnoCSS/压缩等插件
 * 适用：admin Web（bs:*）与 Tauri CS（cs:*）共用；Electron 插件已摘掉，待 Task 5 删文件
 */

import type { PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { AutoRegistryComponents } from "./plugins/component";
import { AutoImportDeps } from "./plugins/autoImport";
import { ConfigCompressPlugin } from "./plugins/compress";
import { ConfigRestartPlugin } from "./plugins/restart";
import { UnoCSSPlugin } from "./plugins/unocss";
import svgLoader from "vite-svg-loader";
import Icons from "unplugin-icons/vite";

/**
 * 组装 Vite plugins；压缩插件由 env.VITE_USE_COMPRESS 控制（Tauri CS 侧在 vite.config 强制关闭）
 */
export function createVitePlugins(env: ViteEnv, isBuild: boolean) {
  const { VITE_USE_COMPRESS } = env;

  const vitePlugins: (PluginOption | PluginOption[])[] = [
    // vue支持
    vue(),
    // JSX支持
    vueJsx(),
    // 监听配置文件改动重启
    ConfigRestartPlugin(),
    // 自动按需注册组件
    AutoRegistryComponents(),
    // 自动按需引入依赖
    AutoImportDeps(),
    // unocss
    UnoCSSPlugin(),
    // svg组件化支持
    svgLoader(),
    // 自动按需加载图标
    Icons({
      compiler: "vue3",
      scale: 1
    })
  ];

  if (isBuild && VITE_USE_COMPRESS) {
    vitePlugins.push(ConfigCompressPlugin());
  }

  return vitePlugins;
}
