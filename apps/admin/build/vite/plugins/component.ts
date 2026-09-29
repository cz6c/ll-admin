/**
 * @name  AutoRegistryComponents
 * @description 按需解析 Ant Design Vue / VueUse；Cc 业务组件走 registerCcComponents 全局注册
 */

import Components from "unplugin-vue-components/vite";
import { VueUseComponentsResolver, AntDesignVueResolver } from "unplugin-vue-components/resolvers";

export const AutoRegistryComponents = () => {
  return Components({
    dts: "types/components.d.ts",
    directives: true,
    include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
    exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/],
    // antdv4 走 CSS-in-JS，resolver 不再拉 less/css 旁路
    resolvers: [VueUseComponentsResolver(), AntDesignVueResolver({ importStyle: false, resolveIcons: false })]
  });
};
