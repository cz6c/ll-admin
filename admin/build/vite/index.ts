/**
 * @name createVitePlugins
 * @description 封装plugins数组统一调用
 */

import type { PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueDevTools from "vite-plugin-vue-devtools";
import progress from "vite-plugin-progress";
import { ConfigSvgIconsPlugin } from "./plugins/svgIcons";
import { AutoRegistryComponents } from "./plugins/component";
import { AutoImportDeps } from "./plugins/autoImport";
import { ConfigCompressPlugin } from "./plugins/compress";
import { ConfigRestartPlugin } from "./plugins/restart";
import { ConfigImageminPlugin } from "./plugins/imagemin";
import { ConfigVisualizerConfig } from "./plugins/visualizer";
import { UnoCSSPlugin } from "./plugins/unocss";

export function createVitePlugins(env: ViteEnv, isBuild: boolean) {
  const { VITE_USE_COMPRESS, VITE_USE_REPORT } = env;

  const vitePlugins: (PluginOption | PluginOption[])[] = [
    // vue支持
    vue(),
    // JSX支持
    vueJsx(),
    // 调试工具
    vueDevTools(),
    // 构建显示进度条
    progress(),
    // 监听配置文件改动重启
    ConfigRestartPlugin(),
    // 自动按需注册组件
    AutoRegistryComponents(),
    // 自动按需引入依赖
    AutoImportDeps(),
    // unocss
    UnoCSSPlugin(),
    // vite-plugin-svg-icons
    ConfigSvgIconsPlugin(isBuild)
  ];

  if (isBuild) {
    // 图片压缩 vite-plugin-imagemin
    vitePlugins.push(ConfigImageminPlugin());

    // 开启.gz压缩  rollup-plugin-gzip
    VITE_USE_COMPRESS && vitePlugins.push(ConfigCompressPlugin());

    // 打包体积分析 rollup-plugin-visualizer
    VITE_USE_REPORT && vitePlugins.push(ConfigVisualizerConfig());
  }

  return vitePlugins;
}
