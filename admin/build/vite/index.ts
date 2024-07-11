/**
 * @name createVitePlugins
 * @description 封装plugins数组统一调用
 */

import type { PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import vueSetupExtend from "vite-plugin-vue-setup-extend-plus";
import { ConfigSvgIconsPlugin } from "./plugins/svgIcons";
import { AutoRegistryComponents } from "./plugins/component";
import { AutoImportDeps } from "./plugins/autoImport";
import { ConfigCompressPlugin } from "./plugins/compress";
import { ConfigRestartPlugin } from "./plugins/restart";
import { ConfigProgressPlugin } from "./plugins/progress";
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
    // setup语法糖组件名支持
    vueSetupExtend(),
  ];

  // 自动按需注册组件
  vitePlugins.push(AutoRegistryComponents());

  // 自动按需引入依赖
  vitePlugins.push(AutoImportDeps());

  // 监听配置文件改动重启
  vitePlugins.push(ConfigRestartPlugin());

  // 构建时显示进度条
  vitePlugins.push(ConfigProgressPlugin());

  // unocss
  vitePlugins.push(UnoCSSPlugin());

  // vite-plugin-svg-icons
  vitePlugins.push(ConfigSvgIconsPlugin(isBuild));

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
