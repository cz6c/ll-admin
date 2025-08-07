// @ts-check
import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["eslint.config.mjs"]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      },
      sourceType: "commonjs",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    rules: {
      "prettier/prettier": [
        "error",
        {
          printWidth: 160,
          endOfLine: "auto",
          // 对象数组末尾不需要逗号
          trailingComma: "none",
          // 箭头函数的参数在需要时才加括号
          arrowParens: "avoid"
        }
      ],
      // 关闭禁止使用 any 类型的规则
      "@typescript-eslint/no-explicit-any": "off",
      // 必须处理 Promise 的规则（警告级别）
      "@typescript-eslint/no-floating-promises": "warn",
      // 未使用变量（警告级别）
      "@typescript-eslint/no-unused-vars": "warn",
      // 关闭 TypeScript 的安全性检查规则（宽松类型检查）
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      // 不检查返回 void 的 Promise
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false
        }
      ],
      // 禁止重复声明变量（错误级别）
      // "@typescript-eslint/no-redeclare": "error",
      "@typescript-eslint/no-redeclare": [
        "error",
        {
          builtinGlobals: false, // 忽略内置全局变量
          ignoreDeclarationMerge: true // 允许声明合并
        }
      ],
      // 允许使用 @ts-ignore 等 TypeScript 注释
      "@typescript-eslint/ban-ts-comment": "off",
      // 优先使用 as const 字面量断言（警告级别）
      "@typescript-eslint/prefer-as-const": "warn",
      // 允许空函数
      "@typescript-eslint/no-empty-function": "off",
      // 允许使用非空断言运算符 !
      "@typescript-eslint/no-non-null-assertion": "off",
      // 允许未使用的表达式
      "@typescript-eslint/no-unused-expressions": "off",
      // 关闭不安全的函数类型检查
      "@typescript-eslint/no-unsafe-function-type": "off",
      // 禁止导入类型时产生副作用（错误级别）
      "@typescript-eslint/no-import-type-side-effects": "error",
      // 关闭要求导出函数和类必须有返回类型的规则
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false, fixStyle: "inline-type-imports" }],
      "@typescript-eslint/prefer-literal-enum-member": ["error", { allowBitwiseExpressions: true }]
    }
  }
);
