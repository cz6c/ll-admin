/**
 * @name AutoImportDeps
 * @description 按需加载，自动引入
 */

import AutoImport from "unplugin-auto-import/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

export const AutoImportDeps = () => {
  return AutoImport({
    dts: "types/auto-imports.d.ts",
    imports: [
      "vue",
      "pinia",
      "vue-router",
      {
        "@vueuse/core": [],
      },
    ],
    eslintrc: {
      enabled: true, // 默认false, true启用。生成一次就可以，避免每次工程启动都生成，一旦生成配置文件之后，最好把enable关掉，即改成false。否则这个文件每次会在重新加载的时候重新生成，这会导致eslint有时会找不到这个文件。当需要更新配置文件的时候，再重新打开
    },
    // 自动导入 Element Plus 相关函数，如：ElMessage, ElMessageBox... (带样式)
    resolvers: [ElementPlusResolver({ importStyle: "sass" })],
  });
};
