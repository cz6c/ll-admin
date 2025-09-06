/**
 * @name ElectronPlugin
 * @description 支持electron
 */

import electron from "vite-plugin-electron/simple";
import pkg from "../../../package.json";

export const ElectronPlugin = (isBuild: boolean) => {
  return electron({
    main: {
      // Shortcut of `build.lib.entry`
      entry: "electron/main/index.ts",
      vite: {
        build: {
          sourcemap: !isBuild,
          minify: isBuild,
          outDir: "dist-electron/main",
          rollupOptions: {
            external: Object.keys("dependencies" in pkg ? pkg.dependencies : {})
          }
        }
      }
    },
    preload: {
      input: "electron/preload/index.ts",
      vite: {
        build: {
          sourcemap: !isBuild ? "inline" : undefined, // #332
          minify: isBuild,
          outDir: "dist-electron/preload",
          rollupOptions: {
            external: Object.keys("dependencies" in pkg ? pkg.dependencies : {})
          }
        }
      }
    },
    // Ployfill the Electron and Node.js API for Renderer process.
    // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
    // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
    renderer: {}
  });
};
