# Skill 撰写与维护（方法论）

本文件约定 **如何写/拆/同步 skill**，不替代业务流程入口（`c-page`）或约束权威（`.cursor/rules`）。

灵感来自开源 skill 集合的「按需加载 + 文档蒸馏」做法；**本仓不安装、不 vendoring 第三方 skill 包**。栈约定与禁止项仍以对应 rule 为准。

## 何时写 Skill vs Rule

先读 `skill-rule-boundary.mdc`，二选一：

| 内容 | 落点 |
|------|------|
| 长什么样 / 禁止什么（命名、注释门禁、栈、migration 等） | **Rule** |
| 怎么走完一件事（步骤、样板路径、关卡、完成检查） | **Skill** |

Skill 需要门禁时：只写 **一句提醒 + 规则文件名**，禁止再贴对照表或条文全文。

## 推荐结构：短入口 + 按需 references

入口 `SKILL.md` 保持可扫读；细则放同目录 `reference.md` 或 `references/*.md`，由入口表格链接。

```text
mySkill/
  SKILL.md           # description + 步骤骨架 + 链接表
  reference.md       # 或 references/foo.md —— 细则、样例、长清单
```

| 放进 SKILL.md | 放到 reference |
|---------------|----------------|
| `description`（触发语） | 长代码样例 |
| 入口顺序 / 停止关卡 | 字段对照、完成检查细表 |
| 要改/不改边界（短） | 多场景分支说明 |

已有范例：`c-workflow` + `reference.md`、`c-defense` + `reference.md`、`c-page` + `profiles.md` / `anchors.md`。

**description 写法**：写清「何时用」与触发词，避免与兄弟 skill 抢触发；治理类（`c-*`）优先于装配类。

## 从文档蒸馏 Skill（可选）

当知识来自**外部/上游文档**（框架手册、内部 RFC），且不宜整篇塞进 always-on rule 时，可蒸馏为 on-demand skill：

1. **只写 agent 易错或本仓特化用法** — 跳过安装指南、入门介绍、模型已熟知的常识。  
2. **为 agent 重写** — 勿整段粘贴原文；给可执行模式、反例、与本仓 rule 的衔接句。  
3. **一概念一文件** — 大主题拆进 `references/`，入口用表格索引。  
4. **解释 why / when** — 不只罗列 API。  
5. **约束不进蒸馏稿** — 若条目已是「禁止/必须」，应进 rule；skill 只链规则名。

蒸馏稿若可能与 rule 冲突，在 `SKILL.md` 顶部注明：**冲突时以 `.cursor/rules` 为准**。

## 可选：GENERATION.md（可追溯同步）

仅当 skill **明确从某文档源生成/同步**时使用；手写业务流程 skill（如 `c-page`、装配类）**不必**建此文件。

```markdown
# Generation Info

- **Source:** <文档或仓库路径 / URL>
- **Git SHA / 版本:** <可复现标识>
- **Generated:** <YYYY-MM-DD>
```

更新流程：

1. 对照 Source 自记录标识以来的变更（如 `git diff <old-sha>..HEAD -- docs/`）。  
2. 只改受影响的 reference / 入口表。  
3. 更新 `GENERATION.md` 中的标识与日期。

## 本仓落盘与同步

- 权威副本：`.cursor/skills/`  
- 同步副本：`.agents/skills/`（**改一处必须改另一处**）  
- 新 skill 登记进两边的 `README.md` 索引表  
- 路径命名遵守 `file-naming.mdc`（本方法论文件为小驼峰 `skillAuthoring.md`）

## 明确不做

- 不通过 `skills-npm` / `@antfu/skills` 等把第三方 skill 装进本仓  
- 不用外部「工具链偏好」覆盖 `vue-admin` / `nestjs-server` / `monorepo-core` 等  
- 不把本文件升级为 alwaysApply rule（保持按需阅读）
