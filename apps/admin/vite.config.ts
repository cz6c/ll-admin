import { type UserConfigExport, type ConfigEnv, loadEnv } from "vite";
import { resolve } from "path";
import { createVitePlugins } from "./build/vite";
import { wrapperEnv } from "./build/utils";
import { createProxy } from "./build/vite/proxy";
import { optimizeDepsInclude } from "./build/vite/optimize";

const pathResolve = (dir: string) => {
  return resolve(process.cwd(), ".", dir);
};

// https://vitejs.dev/config/
export default ({ command, mode }: ConfigEnv): UserConfigExport => {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  // isCS: 非 bs:* 生命周期（dev / cs:* 等）；isTauri: Tauri CLI 注入或 cs:* 脚本
  const isCS = !lifecycle.includes("bs");
  const isTauri =
    Boolean(process.env.TAURI_ENV_PLATFORM) || lifecycle.startsWith("cs");
  const isBuild = command === "build";
  const isProduction = mode === "production";
  const root = process.cwd();
  const env = loadEnv(mode, root);
  const viteEnv = wrapperEnv(env);

  // isCS 保留供后续 CS 专用分支；当前插件列表仅用 isBuild + isTauri 压缩开关
  void isCS;

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
    clearScreen: false,
    /*  https://cn.vitejs.dev/config/server-options.html#server-proxy */
    server: {
      host: true,
      hmr: true,
      port: viteEnv.VITE_PORT,
      strictPort: true,
      proxy: createProxy(viteEnv.VITE_PROXY),
      watch: {
        // 忽略 Rust 侧变更，避免 Vite 重启与 cargo 争抢
        ignored: ["**/src-tauri/**"]
      }
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    plugins: createVitePlugins(
      {
        ...viteEnv,
        // CS/Tauri 直接读 dist 文件；.gz 仅给 Nginx，避免误配压缩产物进壳
        VITE_USE_COMPRESS: isTauri ? false : viteEnv.VITE_USE_COMPRESS
      },
      isBuild
    ),
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
