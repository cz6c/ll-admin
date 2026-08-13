/**
 * @name  AutoRegistryComponents
 * @description 按需加载，自动引入组件（Ant Design Vue）
 */

import Components from "unplugin-vue-components/vite";
import { VueUseComponentsResolver, AntDesignVueResolver } from "unplugin-vue-components/resolvers";

export const AutoRegistryComponents = () => {
  return Components({
    dirs: ["src/components"],
    extensions: ["vue", "md"],
    deep: true,
    dts: "types/components.d.ts",
    directoryAsNamespace: false,
    globalNamespaces: [],
    directives: true,
    include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
    exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/],
    // antdv4 走 CSS-in-JS，resolver 不再拉 less/css 旁路
    resolvers: [VueUseComponentsResolver(), AntDesignVueResolver({ importStyle: false, resolveIcons: false })]
  });
};
