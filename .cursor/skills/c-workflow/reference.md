# c-workflow 参考

## 对话蓝图模板

```text
### 问题详述
- 现象：
- 根因（或假设）：
- 涉及端/模块：

### 结论
- …

### 蓝图
要改：
- [ ] path — 改什么
不改：
- [ ] path — 为何不动（兄弟页/共享/范围外）
```

## 最简代码与复杂度预算

| 档位 | 特征 | 允许 |
|------|------|------|
| S | 单文件、局部逻辑 | 就地修；禁止新抽象层 |
| M | 同模块多文件 | 可加薄封装；禁止新包/新插件 |
| L | 跨端或新模块 | 按装配 skill；新能力进现有 plugins/utils，勿平行造轮子 |

四道门禁（任一「否」则降档）：

1. 是否必须新文件？同文件/邻文件能否容纳？  
2. 是否必须新依赖？现有 `@llcz/common` / hooks / plugins 能否复用？  
3. 是否必须新抽象（service/manager/wrapper）？直接调用是否更清晰？  
4. 是否必须改共享件？能否只改指定入口？

## 关联同步速查（按画像）

| 画像 | 常同步 |
|------|--------|
| admin-bs | `api` · `#/api` 类型 · `views` · 权限码/菜单（若新按钮） |
| admin-cs | Rust mod · `lib.rs` handler · `api` invoke · 页面/Modal · flow md |
| server | controller · service · dto · entity；（migration/init 仅用户同意后） |
| uni | 页面 · `definePage` · `src/api` · `wd-form` schema ·（基址迁移单独确认） |
