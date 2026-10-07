# iCloud Shared Library 接入 — Phase 1 设计草案

> **范围：** 仅 **Shared Photo Library（共享图库）**；不含 Shared Albums（sharedstreams）。  
> **对齐：** 2026-09-29 · 前提：Hidden 相册已落地（`catalog_scope` + 双枚举 + 混排 UI）。  
> **姊妹文档：** [cloudSyncFlow](./cloudSyncFlow.md) · [schemaCatalog](./schemaCatalog.md)

---

## 1. 产品约定（已拍板 / 待实现）

| 项 | 约定 |
|----|------|
| 范围 | **只做 Shared Library** |
| scope 互斥 | 同一 `asset_id` **不会**同时出现在 library / hidden / shared；见 §2 |
| UI | CS 设置开关；抽屉 **单一宫格混排**（与 Hidden 一致）；角标 👥 |
| 落盘 | `{albumRoot}/iCloudSync/<AppleID>/Shared/` |
| 开关 OFF | 不 catalog shared；列表/summary 不展示；DB 行保留；`mark_catalog_deletions` 仅删 library（+ 现有 hidden 规则） |
| 删云 | 勾选移除所选（含已加载的 shared 项；与 Hidden 一致） |
| 删云确认 | shared 项文案加重（删的是共享库原件，所有参与者不可见） |

---

## 2. Scope 互斥与迁移

### 2.1 稳态：三 scope 不并存

```text
私库 PrimarySync
├── library  （photos.all · WithoutHiddenOrDeleted）
└── hidden   （Hidden 智能相册 · 与 library 查询互斥）

shared zone（photos.shared_libraries）
└── shared   （与个人私库成员互斥）
```

**catalog 合并后**：同一 `asset_id` 在单次 `done.items` 中最多出现 **一次**。若 sidecar merge 发现重复 id，按优先级保留一行并打 warn 日志：`shared > hidden > library`。

### 2.2 迁移：同 id 换 scope（UPDATE，非三份并存）

用户将照片迁入/迁出共享图库时，Apple 会移动 CloudKit 成员关系：

| 事件 | catalog 表现 | DB 动作 |
|------|-------------|---------|
| 私库 → 共享图库 | library 消失；shared 出现（**同 asset_id**） | **ScopeMigration**：UPDATE `catalog_scope` + `library_zone`；见 §5.3 |
| 共享 → 复制回个人 | shared 消失；library 出现 | 同上 |
| hidden ↔ library | hidden 查询与 all 互斥 | 一般仅 scope 在 hidden/library 间 UPDATE |

**主键保持** `(apple_id, asset_id, part)` — 不因 scope 扩展 PK。

### 2.3 已下载文件的 scope 迁移

当 `cloud_state=synced` 且 `dest_path` 已存在，scope 从 `library` → `shared`：

1. **优先**：保留本地文件，**不强制重下**；UPDATE scope + 必要时 **rename/move** 到 `Shared/` 子目录（若旧路径在账号根或 `Hidden/`）。
2. **dest_path 更新**：写新绝对路径；触发 album scan ingress 更新 `media.path`（或依赖下次 discover 增量）。
3. **若 fingerprint / changeTag 也变**：走 `Modified` → 重下（与现网一致）。

---

## 3. Sidecar 协议

### 3.1 Settings（Rust ↔ 前端，已有通道）

`IcloudSyncSettings` 增量：

```typescript
// api/icloudSync.ts
syncSharedLibrary: boolean;  // default false
```

### 3.2 catalog 命令（stdin JSON）

**现有：**

```json
{ "cmd": "catalog", "view": "library", "include_hidden": true, "apple_id": "...", "session_dir": "..." }
```

**扩展：**

```json
{
  "cmd": "catalog",
  "view": "library",
  "include_hidden": true,
  "include_shared_library": true,
  "apple_id": "...",
  "session_dir": "..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `include_shared_library` | bool | **仅 `view=library` 生效**；`recents` 忽略 |
| `include_hidden` | bool | 行为不变；可与 shared 同时为 true |

**枚举顺序（固定，便于日志与测试）：**

```text
1. photos.all                    → catalog_scope=library
2. [optional] Hidden album       → catalog_scope=hidden
3. [optional] each shared zone   → catalog_scope=shared
   for zone_name, lib in photos.shared_libraries.items():
       lib.all → items
```

**无共享图库时**：`shared_libraries` 为空 → 不报错，返回 0 条 shared（与 Hidden 不可用区分：Hidden 不可用 raise，shared 空为正常）。

**错误码（新增建议）：**

| code | 含义 |
|------|------|
| `shared_library_unavailable` | zones/list 失败且非空库预期（可选；或 degrade 为空） |
| `catalog_scope_conflict` | merge 后仍无法去重（不应出现；诊断用） |

### 3.3 catalog item 字段（done.items[]）

**现有字段保留**；下列为 **Shared 必填 / 推荐**：

| 字段 | library | hidden | shared |
|------|---------|--------|--------|
| `asset_id` | ✓ | ✓ | ✓ |
| `catalog_scope` | `library` | `hidden` | `shared` |
| `library_type` | `private` | `private` | `shared` |
| `library_zone` | `PrimarySync` | `PrimarySync` | CloudKit `zoneName`（如 `SharedLibrary-…`） |
| `capture_at` / `added_at` / `parts` / CPL 元数据 | ✓ | ✓ | ✓ |

```json
{
  "asset_id": "ABC…",
  "filename": "IMG_001.HEIC",
  "media_kind": "photo",
  "live_pair_id": "ABC…",
  "capture_at": "2024-06-01T12:00:00Z",
  "added_at": "2024-06-02T12:00:00Z",
  "parts": ["still"],
  "catalog_scope": "shared",
  "library_type": "shared",
  "library_zone": "SharedLibrary-XXXXXXXX",
  "cpl_asset_record_name": "…",
  "cpl_asset_change_tag": "…"
}
```

**Mock（`ICLOUD_SYNC_MOCK=1`）：** 追加 `MOCK_SHARED_CATALOG_ITEMS`（如 `S1`），`include_shared_library=true` 时合并。

### 3.4 download_batch / delete_assets（zone 上下文）

**问题：** 现网 lookup/download/delete 绑定 `api.photos`（PrimarySync zone）。

**方案：** 每条 item 携带 catalog 落库的 zone 上下文；sidecar 用其构造 **临时 PhotoLibrary**（或扩展 `ipdPhotos` 函数签名）。

**download_batch item 增量：**

```json
{
  "asset_id": "…",
  "part": "still",
  "dest_path": "…",
  "library_type": "shared",
  "library_zone": "SharedLibrary-XXXXXXXX"
}
```

**delete_assets item 增量：** 同上（`library_type` + `library_zone`）；CPL 删仍用 `cpl_asset_record_name` + changeTag，但 HTTP endpoint 与 `zoneID` 走 shared。

**缺省：** `library_type=private` 且 `library_zone=PrimarySync` → 与现网行为一致。

**Rust → sidecar：** 从 `assets` 表读 `library_type` / `library_zone` 写入 batch（catalog 时落库）。

### 3.5 preview_probe（Phase 1 可选）

网格 thumb 仍走 sidecar `preview_probe`。Shared 项需传 zone 上下文；**Phase 1 可接受**：shared 且未下载时仅显示占位/无 thumb，下载后走 album.media（与部分 edge 一致）。Spike 后决定是否同期改 preview。

---

## 4. SQLite 迁移（state.db · assets）

### 4.1 新列

| 列 | 类型 | 默认 | 说明 |
|----|------|------|------|
| `catalog_scope` | TEXT | `'library'` | **已有**；取值扩展为 `library \| hidden \| shared` |
| `library_type` | TEXT | `'private'` | `private \| shared`；lookup/download/delete 路由 |
| `library_zone` | TEXT | `'PrimarySync'` | CloudKit zoneName |

**迁移方式（与现网一致）：** `ensure_assets_column` + `ALTER TABLE`，不 bump `user_version`。

```sql
-- 伪代码：db.rs ensure_schema
ALTER TABLE assets ADD COLUMN library_type TEXT NOT NULL DEFAULT 'private';
ALTER TABLE assets ADD COLUMN library_zone TEXT NOT NULL DEFAULT 'PrimarySync';
-- catalog_scope 列已存在，仅扩展枚举语义
```

**回填：** 旧行默认 `library` / `private` / `PrimarySync`；Hidden 行已有 `catalog_scope=hidden`，回填 `library_zone=PrimarySync`。

### 4.2 主键与索引

- **UNIQUE 不变：** `(apple_id, asset_id, part)`
- **新增索引（可选）：** `idx_assets_scope ON assets(apple_id, catalog_scope)` — 供列表过滤

### 4.3 schemaCatalog 同步

更新 [schemaCatalog.md](./schemaCatalog.md) 中 `assets` 表说明（实现时一并改）。

---

## 5. Rust 改动清单

### 5.1 types.rs

```rust
pub enum CatalogScope {
  Library,
  Hidden,
  Shared,  // 新增
}

pub enum LibraryType {
  Private,
  Shared,
}

// AssetRow / SyncAssetRow / CatalogItem 增加：
pub library_type: LibraryType,
pub library_zone: String,

// IcloudSyncSettings:
pub sync_shared_library: bool,
```

### 5.2 catalog_diff.rs — 分类扩展

在 `classify_catalog_row` 中，当 `existing` 命中且 **仅** `catalog_scope` / zone 变化、fp+changeTag 不变：

→ 新枚举值 **`CatalogDeltaKind::ScopeMigration`**（或并入 `MetadataRefresh` 并强制 UPDATE scope + dest_path 逻辑）。

**推荐独立 `ScopeMigration`：**

- 不置 `cloud_state=cloud_only`（已 synced 且文件仍在旧路径 → 仅 move + UPDATE）
- 未下载 → 等同 Added 或 MetadataRefresh（scope 写入即可）

### 5.3 apply_catalog_delta

| 分类 | scope 迁移时 |
|------|-------------|
| Added | INSERT，scope/type/zone 来自 catalog |
| ScopeMigration | UPDATE scope/type/zone；若 synced 且 dest 需迁 → 调度 move（同步或 best-effort rename） |
| Modified | 现网；scope 以 catalog 为准覆盖 |
| MetadataRefresh | UPDATE 元数据 + scope 字段 |
| Unchanged | 批量 touch；若 DB scope 与 catalog 不一致 → **升格为 ScopeMigration**（防御索引延迟） |

### 5.4 mark_catalog_deletions(conn, apple_id, include_hidden, include_shared)

| 开关 | DELETE 范围 |
|------|-------------|
| 两者 OFF | 仅 `catalog_scope IN ('library')` 或 `NULL` |
| hidden ON | + hidden 参与 temp 对比 |
| shared ON | + shared 参与 temp 对比 |
| hidden OFF | hidden 行 **不** 因「catalog 不见」被删 |
| shared OFF | shared 行 **不** 因「catalog 不见」被删 |

实现：将 scope_clause 从二元扩展为 **「本次 catalog 纳入的 scope 集合」** SQL IN 子句。

### 5.5 queue.rs

- `fetch_catalog(..., include_shared_library)`
- `parse_catalog_items` 解析 `library_type` / `library_zone`
- `dest_path_for_asset`：`Shared` → `.../Shared/{filename}`
- `persist_catalog_delta` 传 settings.sync_shared_library
- download/delete batch 附带 zone 字段

### 5.6 cloud_assets.rs

- `push_sync_scope_filter`：OFF 时排除 `catalog_scope='shared'`
- `load_sync_assets` / `get_cloud_state_summary` 读 settings

### 5.7 ipdPhotos.py（sidecar）

新增或扩展：

```python
def photos_service_for_zone(api, library_type: str, library_zone: str) -> Any:
    """返回绑定 zone 的 PhotoLibrary；private+PrimarySync 即 api.photos。"""

def fetch_photo_assets_by_ids_for_zone(api, asset_ids, library_type, library_zone) -> ...
def delete_cpl_asset_by_record_for_zone(api, record_name, change_tag, library_type, library_zone) -> ...
```

---

## 6. 前端

### 6.1 CS 设置（csSettings/index.vue）

- Checkbox：**一并同步共享图库**
- 文案：与个人图库、Hidden 混排；落盘 `…/Shared/`；关闭后不再刷新 shared，已下载保留

### 6.2 API（icloudSync.ts）

```typescript
syncSharedLibrary: boolean;
// IcloudSyncSyncAssetRow
catalogScope?: 'library' | 'hidden' | 'shared';
libraryType?: 'private' | 'shared';
libraryZone?: string;
```

### 6.3 IcloudSyncFab.vue

- `isShared = row.catalogScope === 'shared'`
- 角标 👥（与 🔒 可并存 corner：左上 hidden、右上 shared 或合并 tooltip）
- tooltip / title：「共享图库」
- 删云确认：选中含 shared 时追加一句警告

---

## 7. 测试计划

### 7.1 Sidecar（pytest）

| 用例 | 断言 |
|------|------|
| mock catalog + `include_shared_library=true` | items 含 S1；`catalog_scope=shared` |
| mock + shared false | 无 S1 |
| recents + shared true | 忽略 shared |
| merge 去重 | 同 asset_id 仅一行（构造冲突 mock） |

### 7.2 Rust（cargo test --lib icloud_sync）

| 用例 | 断言 |
|------|------|
| classify scope migration | library→shared，fp 不变 → ScopeMigration |
| mark_catalog_deletions shared OFF | shared 行不在 catalog 时不 DELETE |
| dest_path_for_asset shared | 路径含 `/Shared/` |
| load_sync_assets filter | sync_shared_library=false 不返回 shared |

### 7.3 Spike（真账号，实现前）

- [ ] `shared_libraries` 非空枚举
- [ ] 1 张 shared lookup + download
- [ ] 1 张 shared delete（参与者账号）
- [ ] 1 张 personal→shared 迁移前后两次 catalog 的 id/scope 行为

---

## 8. 实现顺序（建议）

```text
1. Spike（真账号）→ 确认 zone 字段与 delete 权限
2. sidecar：枚举 + mock + merge 去重
3. ipdPhotos：zone 感知 lookup/download/delete
4. Rust：DB 列 + types + parse + dest_path
5. catalog_diff：ScopeMigration + mark 扩展
6. 前端：开关 + 角标 + 删云文案
7. 文档：cloudSyncFlow §Shared Library + schemaCatalog
8. 全量：cargo test + pytest + 手工腾空间循环
```

---

## 9. 明确不做（Phase 1）

- Shared Albums（sharedstreams）
- 按用户自建相册 selective sync
- shared 未下载项的 thumb preview（可 Phase 1.1）
- 多 shared zone（Apple 现网通常 1 个；代码按 dict 枚举即可）

---

## 10. 开放项（Spike 后关闭）

| # | 问题 | 默认 |
|---|------|------|
| 1 | shared zone 超过 1 个时落盘 `Shared/<zone>/` 还是扁平 `Shared/` | 扁平 `Shared/`（zone 写 DB） |
| 2 | scope 迁移是否 always move 文件 | synced 则 move；cloud_only 只 UPDATE path 列 |
| 3 | 参与者删 shared 是否允许 | 允许（Apple 允许）；UI 强确认 |
| 4 | `shared_libraries` 空 vs API 错误 | 空 → 0 条；HTTP 4xx/5xx → catalog 失败或 partial（Spike 定） |
