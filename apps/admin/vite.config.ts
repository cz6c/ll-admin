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
  // isTauri: Tauri CLI 注入 TAURI_ENV_*，或 cs:* npm 脚本（压缩关闭等）
  const isTauri =
    Boolean(process.env.TAURI_ENV_PLATFORM) || lifecycle.startsWith("cs");
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
          // 必须用文件系统绝对路径：@/ 别名在 Linux CI 上会被 Sass 当成相对路径再拼到当前 scss 目录，导致 ENOENT
          additionalData: `@use "${pathResolve("src/assets/style/theme.scss").replace(/\\/g, "/")}" as *;`
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
