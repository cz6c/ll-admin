/* eslint-disable prettier/prettier */
/** @type {import('cz-git').UserConfig} */
module.exports = {
  rules: {
    // @see: https://commitlint.js.org/#/reference-rules
    "body-leading-blank": [2, "always"],
    "footer-leading-blank": [1, "always"],
    "header-max-length": [2, "always", 108],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    "subject-case": [0],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "style",
        "perf",
        "refactor",
        "revert",
        "test",
        "docs",
        "chore",
        "workflow",
        "ci",
        "build",
        "types",
        "wip",
      ],
    ],
  },
  extends: ["@commitlint/config-conventional"],
  prompt: {
    alias: { fd: "docs: fix typos" },
    // 是否在选择 ISSUE 前缀 显示为跳过选项(skip)
    allowEmptyIssuePrefix: false,
    // 是否在选择 ISSUE 前缀 显示自定义选项(custom)
    allowCustomIssuePrefix: false,
    customScopesAlias: "custom    自定义",
    emptyScopesAlias: "empty    不填写",
    messages: {
      type: "选择你要提交的类型 :",
      scope: "选择一个提交范围（可选）:",
      customScope: "请输入自定义的提交范围 :",
      subject: "填写简短精炼的变更描述 :\n",
      body: '填写更加详细的变更描述（可选）。使用 "|" 换行 :\n',
      breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行 :\n',
      footerPrefixesSelect: "选择关联issue前缀（可选）:",
      customFooterPrefix: "输入自定义issue前缀 :",
      footer: "列举关联issue (可选) 例如: #31, #I3244 :\n",
      confirmCommit: "是否提交或修改commit ?",
    },
    types: [
      { value: "feat", name: "feat: 新增功能" },
      { value: "fix", name: "fix: 修复问题/BUG" },
      { value: "style", name: "style: 代码风格相关无影响运行结果的" },
      { value: "perf", name: "perf: 优化/性能提升" },
      { value: "refactor", name: "refactor: 代码重构" },
      { value: "revert", name: "revert: 回退代码 | 回滚 commit" },
      { value: "test", name: "test: 测试相关" },
      { value: "docs", name: "docs: 文档/注释" },
      { value: "chore", name: "chore: 依赖更新/脚手架配置修改等" },
      { value: "workflow", name: "workflow: 工作流改进" },
      { value: "ci", name: "ci: 持续集成" },
      { value: "build", name: "build: 构建相关 | 构建流程、外部依赖变更 (如升级 npm 包、修改打包配置等)" },
      { value: "types", name: "types: 类型定义文件更改" },
      { value: "wip", name: "wip: 开发中" },
    ],
  },
};
