import commonjs from "@rollup/plugin-commonjs"; // 支持 CommonJS
import resolve from "@rollup/plugin-node-resolve"; // 帮助寻找node_modules里的包
import typescript from "@rollup/plugin-typescript"; // 支持ts
import terser from "@rollup/plugin-terser"; // 代码压缩
import json from "@rollup/plugin-json";
import dts from "rollup-plugin-dts"; // 生成.d.ts
import { readFileSync } from "fs";

// 读取 package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// 外部依赖处理
const makeExternalPredicate = (externals) => {
  if (externals.length === 0) return () => false;
  return (id) => externals.some((ext) => id === ext || id.startsWith(`${ext}/`));
};

const externals = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})];

const external = makeExternalPredicate(externals); // // 不要打包，而作为外部依赖

// 共享插件配置
const sharedPlugins = [
  resolve({
    browser: true,
    preferBuiltins: true,
  }),
  commonjs(),
  json(),
  typescript(),
];

// 生产环境压缩
const productionPlugins = [terser()];

// 主配置
export default (commandLineArgs) => {
  const isProduction = commandLineArgs.environment === "production";

  const config = [
    // ESM 构建
    {
      input: "src/index.ts",
      output: {
        dir: "dist/esm",
        format: "esm",
        preserveModules: true,
        preserveModulesRoot: "src",
        sourcemap: true,
        entryFileNames: "[name].mjs",
      },
      external,
      plugins: [...sharedPlugins, ...(isProduction ? productionPlugins : [])],
    },

    // CJS 构建
    {
      input: "src/index.ts",
      output: {
        dir: "dist/cjs",
        format: "cjs",
        preserveModules: true,
        preserveModulesRoot: "src",
        sourcemap: true,
        exports: "auto",
        entryFileNames: "[name].cjs",
      },
      external,
      plugins: [...sharedPlugins, ...(isProduction ? productionPlugins : [])],
    },

    // 类型声明 (单独构建)
    {
      input: "src/index.ts",
      output: {
        dir: "dist/types",
        format: "es",
      },
      plugins: [
        dts(),
      ],
    },
  ];

  return config;
};
