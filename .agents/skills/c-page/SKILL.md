---
name: c-page
description: >-
  tsb monorepo 功能任务统一入口与路由器。判定 admin-bs / admin-cs / server / uni 画像，
  输出任务概览后路由到澄清、工作流或装配 skill。Use when 不确定用哪个 c- skill、
  新功能跨端、改页面/模块/路由/权限/Tauri 命令，或提到 c-page、页面任务、业务闭环。
---

# c-page

## 入口顺序

1. 产品需求/原型/前后端混写 → 先读 [../c-requirement/SKILL.md](../c-requirement/SKILL.md)，完成分析报告后再继续。
2. 歧义、反绕过、范围过宽 → [../c-clarify/SKILL.md](../c-clarify/SKILL.md)；未放行前不写代码、不派实现。
3. 读 [profiles.md](profiles.md) 确认画像；再读 [anchors.md](anchors.md)。
4. 改代码 → [../c-workflow/SKILL.md](../c-workflow/SKILL.md)。纯查询可跳过。
5. 输出下方「任务概览」，再按路由表读子 skill。**本 skill 不进入代码实现。**

## 技能路由

| 信号 | Skill |
|------|--------|
| 产品需求拆分 | `c-requirement` |
| 歧义 / 绕过确认 | `c-clarify` |
| 蓝图 / 最小改动 / 纠错 | `c-workflow` |
| 防御边界 / 吞异常 | `c-defense` |
| Admin 列表页 | `admin-list-page` |
| Admin 编辑弹窗 | `admin-edit-modal` |
| Admin HTTP API 薄封装 | `admin-api-wire` |
| 路由 / 菜单 / 权限 | `admin-route-permission` |
| Nest 新模块 CRUD | `nest-crud-module` |
| Tauri invoke 全链路 | `tauri-command-wire` |
| Uni 新页面 / 路由 | `uni-new-page` |
| Uni wot 表单 | `uni-wot-form` |
| Uni HTTP / API | `uni-api-http` |

## 任务概览（必出）

```text
【理解用户需求】：<一句话>
归属画像：<admin-bs / admin-cs / server / uni / 多端；写证据路径>
归属模块：<如 系统管理-用户 / 相册-重复清理>
参与当前模块 Git 修改人：<当前 identity；相关 author；无法确认则待确认>
预计改动文件/行数：<估算>
现成可复用能力：
  - utils / hook / 同构页面：<路径，或无>
```

无法唯一确定时写「待确认」，不得猜测。

## 停止关卡

继承 [anchors.md](anchors.md)：五条红线、范围契约、共享影响、Git 归因、权限等同、反绕过、临时产物、范围外报告。
