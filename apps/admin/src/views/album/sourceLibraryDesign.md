# 本地相册 · 来源图库切换 — 设计

> **状态：** 2026-10-07 已拍板（Q1–Q4）  
> **画像：** admin-cs（`media.db` + 相册宫格）  
> **姊妹：** [schemaCatalog](./schemaCatalog.md) · [loadingFlow](./loadingFlow.md) · [sharedLibraryDesign](./sharedLibraryDesign.md)

---

## 1. 目标

本地相册按「来源类型 + 来源用户」划分图库，支持：

- 切换到某一图库查看  
- 「全部图库」查看（**默认**）  

体验接近 iPhone 多图库切换，但键模型是本机已入库文件的同步/本地身份，不是云侧 Shared Library 成员关系。

---

## 2. 已拍板

| # | 结论 |
|---|------|
| Q1 | 本轮：本地图库模型 + 宫格切换；**不改** iCloud Shared 云同步链路（该链路已有实现，本需求不依赖、不扩展） |
| Q2 | 图库唯一键复用 **`origin` + `origin_account`**（不新增 `source_*` 列、不建 galleries 表） |
| Q3 | 无来源文件归 **本地** 图库：`origin=local`，`origin_account=_local`；扫描回填 |
| Q4 | iCloud Shared 入库仍属同一 Apple 账号图库；仅保留 `origin_album=Shared` / 角标，**不**拆第二个切换项 |

---

## 3. 图库身份

### 3.1 键与展示

| origin | origin_account | 切换器展示（示例） |
|--------|----------------|-------------------|
| `icloud` | Apple ID | iCloud · {账号} |
| `qzone` | QQ 号 / uin | QQ 空间 · {账号} |
| `local` | `_local` | 本地 |
| 空 | — | **不允许长期存在**；须回填为 local |

唯一键：`(origin, origin_account)`（与目录侧「按账号分子目录」同一语义层）。

### 3.2 与现有字段分工

| 字段 | 职责 |
|------|------|
| `origin` + `origin_account` | **图库键**（本设计） |
| `origin_asset_id` | 云侧资产 id（去重/正本等，不变） |
| `origin_album` | 子范围提示（`Hidden` / `Shared` 等）；**不参与**图库切换键 |

### 3.3 Shared 与「不绑」含义

- **不绑** = 本轮不修改 sidecar / `state.db` / Shared zone 下载删云；云 Shared 同步已存在则继续用现网。  
- Shared 照片入库仍是 `origin=icloud` + 登录 Apple ID + `origin_album=Shared` → 与个人库同一切换项。

---

## 4. 架构（方案 A）

```text
discover / sync ingress
  → media.origin + origin_account 完整（含 local 回填）
  → 前端 allMediaFiles
  → 图库选择器（默认「全部」）∩ 目录筛选
  → filteredFiles → 宫格 / 统计 / 年份轴 / Viewer
```

- **过滤在前端**，对齐现有 `dirFilter` + `matchesLocalSearch`。  
- **不**新增 Rust「按图库 discover」命令（YAGNI；全量已在内存）。

---

## 5. 写入与回填

### 5.1 同步入库（不变）

- iCloud：`origin=icloud`，`origin_account=apple_id`（含 Shared / Hidden）  
- Qzone：`origin=qzone`，`origin_account=uin`

### 5.2 本地回填（本轮必做）

**坑：** `upsert_media` 对 origin 使用 `COALESCE(excluded.origin, media.origin)`。  
若 discover **一律**写入 `local`，会在重扫时把已有 `icloud`/`qzone` **覆盖掉**。

**约定：**

1. discover 路径对已有同步身份行继续传 `origin=NULL`（保留 COALESCE 行为）。  
2. **单独回填**：扫描周期内对当前 root 执行（或等价逻辑）：

```sql
UPDATE media
SET origin = 'local', origin_account = '_local'
WHERE root = ?1
  AND (origin IS NULL OR trim(origin) = '')
  AND (origin_account IS NULL OR trim(origin_account) = '');
```

3. **全新 INSERT**（磁盘新文件、库中无行）：discover 构造行时直接带 `local` / `_local`，避免首帧列表短暂「无图库」。  
   实现时须保证：仅 INSERT 默认值路径带 local；UPDATE 分支不得用 excluded.local 覆盖已有非空 origin（见上 COALESCE 坑）。

4. **禁止**本轮用路径猜 Apple ID / QQ（有同步身份的文件应由 ingress 写入）。

5. **重复清理**：`load_origin_path_index` **必须排除** `origin=local`。本地图库键 ≠ 同步正本；否则回填后纯本地文件会被当成 `in_db`，可能误删 icloud/qzone 副本。

---

## 6. UI

- 位置：相册工具栏，「全部目录」`a-tree-select` **旁**增加图库选择器。  
- 选项：  
  - `全部图库`（`null` / 哨兵，**默认**）  
  - 从当前 `allMediaFiles` 聚合出的去重 `(origin, origin_account)`，展示名按 §3.1  
- 与目录筛选：**且**（同时满足）。  
- 切换图库时：勾选模式建议清空选中（与改目录筛选一致，避免跨库误操作）；年份窗口重置对齐 `dirFilter` 的 watch。  
- 统计文案、Viewer「全部」组、日分组均基于过滤后列表。

---

## 7. 文档与测试

| 项 | 动作 |
|----|------|
| `schemaCatalog.md` | 注明 `origin`/`origin_account` 兼作图库键；`local`/`_local` 约定 |
| `loadingFlow.md` | 一句：工具栏图库筛选 + 默认全部 |
| Rust | 回填 SQL / discover INSERT 单测（不覆盖已有 origin） |
| 手工 | 混有 icloud + 本地文件：默认全部 → 切本地 → 切 iCloud → Shared 与个人同项 |

---

## 8. 明确不做

- 新增 `source_type` / `source_user` 列或 `galleries` 表  
- 改 Shared 云同步 / zone / 删云确认文案  
- 按 Shared 参与者拆多用户图库  
- server / uni  
- 路径推断账号回填  

---

## 9. 验收

1. 默认「全部图库」：与现网宫格一致。  
2. 切到 iCloud·账号 / QQ·账号 / 本地：只显示对应文件。  
3. Shared 与同账号个人库同项；角标行为不变。  
4. 强制重扫后：纯本地文件在「本地」；已同步文件 origin 不被刷成 local。  
5. 图库 ∩ 目录筛选同时生效；统计与 Viewer 索引不错位。
