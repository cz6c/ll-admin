/**
 * @name VxeImport
 * @description 按需加载，自动引入
 */

import { lazyImport, VxeResolver } from "vite-plugin-lazy-import";

export const VxeImport = () => {
  return lazyImport({
    resolvers: [
      VxeResolver({
        libraryName: "vxe-table"
      }),
      VxeResolver({
        libraryName: "vxe-pc-ui"
      })
    ]
  });
};
