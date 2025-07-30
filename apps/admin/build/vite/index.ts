/**
 * @name createVitePlugins
 * @description 封装plugins数组统一调用
 */

import type { PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueDevTools from "vite-plugin-vue-devtools";
import { AutoRegistryComponents } from "./plugins/component";
import { AutoImportDeps } from "./plugins/autoImport";
import { ConfigCompressPlugin } from "./plugins/compress";
import { ConfigRestartPlugin } from "./plugins/restart";
import { UnoCSSPlugin } from "./plugins/unocss";
import svgLoader from "vite-svg-loader";
import Icons from "unplugin-icons/vite";

export function createVitePlugins(env: ViteEnv, isBuild: boolean) {
  const { VITE_USE_COMPRESS } = env;

  const vitePlugins: (PluginOption | PluginOption[])[] = [
    // vue支持
    vue(),
    // JSX支持
    vueJsx(),
    // 调试工具
    vueDevTools(),
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

  if (isBuild) {
    // 开启.gz压缩  rollup-plugin-gzip
    VITE_USE_COMPRESS && vitePlugins.push(ConfigCompressPlugin());
  }

  return vitePlugins;
}
