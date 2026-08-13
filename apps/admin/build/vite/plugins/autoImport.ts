/**
 * @name AutoImportDeps
 * @description 按需加载，自动引入（含 Ant Design Vue API）
 */

import AutoImport from "unplugin-auto-import/vite";
import { AntDesignVueResolver } from "unplugin-vue-components/resolvers";

export const AutoImportDeps = () => {
  return AutoImport({
    dts: "types/auto-imports.d.ts",
    imports: [
      "vue",
      "pinia",
      "vue-router",
      {
        "@vueuse/core": []
      }
    ],
    eslintrc: {
      enabled: true
    },
    resolvers: [AntDesignVueResolver({ importStyle: false, resolveIcons: false })]
  });
};
