import { type UserConfigExport, type ConfigEnv, loadEnv } from "vite";
import { resolve } from "path";
import { createVitePlugins } from "./build/vite";
import { wrapperEnv } from "./build/utils";
import { createProxy } from "./build/vite/proxy";
import { optimizeDepsInclude } from "./build/vite/optimize";
import { rmSync } from "node:fs";

const pathResolve = (dir: string) => {
  return resolve(process.cwd(), ".", dir);
};

// https://vitejs.dev/config/
export default ({ command, mode }: ConfigEnv): UserConfigExport => {
  const lifecycle = process.env.npm_lifecycle_event;
  const isCS = !lifecycle.includes("bs");
  if (isCS) {
    rmSync("dist-electron", { recursive: true, force: true });
  }
  const isBuild = command === "build";
  const isProduction = mode === "production";
  const root = process.cwd();
  const env = loadEnv(mode, root);
  const viteEnv = wrapperEnv(env);
  return {
    root,
    base: viteEnv.VITE_PUBLIC_PATH,
    resolve: {
      alias: [
        // @/xxxx => src/xxxx
        {
          find: /@\//,
          replacement: pathResolve("src") + "/"
        },
        // /#/xxxx => types/xxxx
        {
          find: /#\//,
          replacement: pathResolve("types") + "/"
        }
      ]
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "@/assets/style/theme.scss" as *;' // 引入配置项目主题色文件
        }
      }
    },
    /*  https://cn.vitejs.dev/config/server-options.html#server-proxy */
    server: {
      host: true,
      hmr: true,
      port: viteEnv.VITE_PORT,
      proxy: createProxy(viteEnv.VITE_PROXY)
    },
    plugins: createVitePlugins(viteEnv, isBuild, isCS),
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          //生产环境时移除console
          drop_console: isProduction,
          drop_debugger: isProduction
        }
      }
    },
    // 预构建配置
    optimizeDeps: {
      include: optimizeDepsInclude,
      exclude: ["@iconify/json"]
    }
  };
};
