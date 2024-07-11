import { UserConfigExport, ConfigEnv, loadEnv } from "vite";
import { resolve } from "path";
import { createVitePlugins } from "./build/vite";
import { wrapperEnv } from "./build/utils";
import { createProxy } from "./build/vite/proxy";
import fs from "fs";

// 强制预构建element-plus，解决vite首次启动加载慢
const optimizeDepsElementPlusIncludes = ["element-plus/es", "@wangeditor/editor-for-vue"];
fs.readdirSync("node_modules/element-plus/es/components").map(dirname => {
  fs.access(`node_modules/element-plus/es/components/${dirname}/style/index.mjs`, err => {
    if (!err) {
      optimizeDepsElementPlusIncludes.push(`element-plus/es/components/${dirname}/style/index`);
    }
  });
});

const pathResolve = (dir: string) => {
  return resolve(process.cwd(), ".", dir);
};

// https://vitejs.dev/config/
export default ({ command, mode }: ConfigEnv): UserConfigExport => {
  const isProduction = command === "build";
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
          replacement: pathResolve("src") + "/",
        },
        // /#/xxxx => types/xxxx
        {
          find: /#\//,
          replacement: pathResolve("types") + "/",
        },
      ],
    },
    css: {
      preprocessorOptions: {
        // 配置全局scss文件
        scss: {
          additionalData: '@use "@/assets/style/variables.scss" as *;',
        },
      },
    },
    /*  https://cn.vitejs.dev/config/server-options.html#server-proxy */
    server: {
      host: true,
      hmr: true,
      port: viteEnv.VITE_PORT,
      proxy: createProxy(viteEnv.VITE_PROXY),
    },
    plugins: createVitePlugins(viteEnv, isProduction),
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          //生产环境时移除console
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
    // 预构建配置
    optimizeDeps: {
      include: optimizeDepsElementPlusIncludes,
    },
  };
};
