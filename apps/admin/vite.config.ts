import { type UserConfigExport, type ConfigEnv, loadEnv } from "vite";
import { resolve } from "path";
import { createVitePlugins } from "./build/vite";
import { wrapperEnv } from "./build/utils";
import { createProxy } from "./build/vite/proxy";
import { optimizeDepsElementPlusIncludes } from "./build/vite/optimize";

const pathResolve = (dir: string) => {
  return resolve(process.cwd(), ".", dir);
};

// https://vitejs.dev/config/
export default ({ command, mode }: ConfigEnv): UserConfigExport => {
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
          additionalData: '@use "@/assets/style/theme.scss" as *;', // 引入配置项目主题色文件
          api: "modern-compiler" // 去除sass警告
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
    plugins: createVitePlugins(viteEnv, isBuild),
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
      include: optimizeDepsElementPlusIncludes
    }
  };
};
