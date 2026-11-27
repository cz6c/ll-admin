# 相册相关 SQLite 表目录

> **职责：** 陈列 `media.db` / `state.db` 各表作用（给人与可视化工具对照用）。  
> **不合并：** 两库职责分离，见下文边界。  
> **对齐：** 2026-11-27（移除 `catalog_observations`；共享诊断字段并入 `assets`）  
> 流程：[本地扫描](./loadingFlow.md) · [云同步](./icloudSync/cloudSyncFlow.md) · [登录](./icloudSync/loginFlow.md) · [QQ 空间](./qzoneSync/qzoneSyncFlow.md)

SQLite 无标准表/列 COMMENT；用本文当描述 SSOT。

---

## 边界

| 库 | 路径 | 管什么 |
|----|------|--------|
| **media.db** | `<appData>/album/media.db` | 本地相册根上的文件索引、缩略图/代理缓存路径、展示用 meta |
| **state.db** | `<appData>/icloud-sync/state.db` | iCloud 账号下的**同步资源注册表**（`assets`）与下载态 |
| **settings.json** | `<appData>/icloud-sync/settings.json` | 非敏感 iCloud 同步配置（含共享图库开关、**本账号 CloudKit id**） |

跨库关联（非 FK）：iCloud **下载成功**时把云侧身份写入 `media.origin*`（见下表 `origin_album` ↔ `assets.catalog_scope`）；之后 **media 与 sync 解耦**（不再为 capture 反查 `dest_path`）。`media.path` 与 `assets.dest_path` 仅在「仍已同步且未硬删」时可能重合。

**任务不在 SQLite：** 同步 / catalog 任务头存在进程内存（`icloud_sync/job_mem.rs`）；进程退出后任务消失，不能从 DB 续传。**已删除 `jobs` 表**，新库也不再建。

---

## media.db（本地相册）

实现：`src-tauri/src/album/db.rs`

### `media`

**作用：** 本地相册唯一业务表。discover 写入；缩略图 / meta / 播放代理 / 内容哈希回填；宫格与 Viewer 的数据源。

| 列（摘要） | 含义 |
|------------|------|
| `path` | 主文件绝对路径（PK）；Live 行为 still |
| `root` | 相册根绝对路径 |
| `rel_dir` / `name` / `ext` | 相对目录、文件名、扩展名 |
| `kind` | `image` / `video` / `livephoto` |
| `size` / `modified` | 增量扫描指纹；变则清缓存字段 |
| `thumb_path` / `preview_path` | 宫格 WebP（约 316 边）；HEIC 全尺寸预览 JPEG |
| `video_path` | Live 配对 mov 路径 |
| `playback_path` | HEVC/MOV 的 H.264 代理；或等于源路径（H.264 且非 MOV，表示可直接播放、不必再探测） |
| `capture_at` / `camera` | 拍摄时间 / 机型（仅补空：本表已有 → origin → EXIF → 文件名前缀；用户可覆盖写 `capture_at`） |
| `capture_at_source` | `origin` / `exif` / `filename` / `user` |
| `capture_at_probed` | 已探测拍摄时间 |
| `origin` / `origin_account` | 同步下载入库时的来源身份（catalog 刷新**不**改本表）；**兼作图库键**，`(origin, origin_account)` 唯一标识一个来源图库：`icloud`+Apple ID、`qzone`+uin、纯本地文件 `local`+`_local` |
| `origin_asset_id` | 云侧 `asset_id`（去重/正本等）；与 `state.assets.asset_id` 对应 |
| `origin_album` | **子范围标签**（不参与图库切换键）：iCloud 下载时由 `assets.catalog_scope` 写入，见下表。本地扫描 / 非 iCloud 源多为 NULL |
| `added_at` / `latitude` / `longitude` | 下载时从云侧 catalog 带入（仅补空） |
| `width` / `height` | 栅格=文件头或解码；HEIC=预览 JPEG；单独视频=ffprobe（时长回填或打开兜底） |
| `content_hash` / `hash_algo` | 重复清理用 BLAKE3 |
| `fail_count` | 缩略图或播放预热连续失败；≥2 跳过 |
| `scanned_at` | 最近索引时间 |

**iCloud 下载入库：`origin_album` ↔ `assets.catalog_scope` ↔ 落盘目录**

实现：`icloud_sync/queue.rs`（`icloud_ingress_item`）· 落盘路径见 [cloudSyncFlow](./icloudSync/cloudSyncFlow.md)。

| `assets.catalog_scope` | `media.origin_album` | 典型 `assets.dest_path` / 相对路径 |
|------------------------|----------------------|-------------------------------------|
| `library` | `NULL` | `…/iCloudSync/<AppleID>/{文件}` |
| `hidden` | `Hidden` | `…/iCloudSync/<AppleID>/Hidden/{文件}` |
| `shared` | `Shared` | `…/iCloudSync/<AppleID>/Shared/{文件}` |

`origin` 恒为 `icloud`，`origin_account` 为 Apple ID。QQ 空间同步时 `origin_album` 为相册名（与 iCloud 无关）。

清库：可删整个 `media.db` 后 force 重扫（不碰 `state.db`）。

---

## state.db（iCloud 同步）

实现：`src-tauri/src/icloud_sync/db.rs`

### 读库心智模型

| 表 | 谁写 | 产品是否读 | 一句话 |
|----|------|------------|--------|
| **`assets`** | 每次 catalog diff、下载结果、跳过策略 | **是**（列表 / 入队 / summary） | **当前真相**：以 `(apple_id, asset_id, part)` 唯一标识云侧一行资源 |
| **`catalog_*_temp`** | 单次 catalog 批处理 | 否 | 连接级辅助，无长期意义 |

**已废弃：** 旧版 `catalog_observations`（每轮 append 全量快照）不再创建或写入；排查直接在 **`assets`** + **`settings.json`** 进行。本机若仍有该表，可手动 `DROP` 或忽略。

**不在 SQLite：** 当前登录账号的 CloudKit **本人 id** 存在 **`settings.json` → `cloudkitUserRecordId`**（catalog 成功后由 Rust 从 sidecar 带回并持久化）。与 **`assets.contributed_by`**（每条共享资源的贡献者 id）比对，用于「仅下载本人贡献」。

### Schema 策略

- **不读不写** `PRAGMA user_version`；**不建** `jobs` 表。
- 打开时：无 `assets` 则 `CREATE` 全列；已有表则 **`ALTER TABLE … ADD COLUMN`** 增量迁移（`catalog_scope`、`contributed_by` 等）。
- 任务状态：仅 `job_mem`（进程内 `HashMap`）；`assets.active_job_id` 可指向本次进程的内存 job id。
- WAL：`journal_mode=WAL`，`synchronous=NORMAL`。

### `assets`

**作用：** iCloud 图库在本地的**业务注册表**（catalog diff 后的当前态）。一行一个 `(apple_id, asset_id, part)`；Live 的 still / mov **各一行**。UI 抽屉、云态角标、下载入队、`dest_path` 落盘均读此表。

**主键 / 唯一约束：** `UNIQUE(apple_id, asset_id, part)`；`id` 为自增行号（内部用）。

| 列 | 类型（逻辑） | 含义 |
|----|--------------|------|
| `apple_id` | TEXT | 所属 Apple ID（与 settings 当前账号一致） |
| `asset_id` | TEXT | 云侧资产 id（catalog / 下载 / 删云） |
| `part` | TEXT | `still` / `mov` 等；Live 两行共享同一 `asset_id` |
| `sort_key` | TEXT | 排序键 ISO8601：Library 视图偏拍摄序，Recents 偏加入序 |
| `original_filename` | TEXT | iCloud 侧原始文件名（展示） |
| `media_kind` | TEXT | `photo` / `video` / `live` 等 |
| `live_pair_id` | TEXT? | Live 配对 id |
| `dest_path` | TEXT? | 已下载文件的**绝对路径**；未下载为 NULL。目录约定：`{albumRoot}/iCloudSync/<AppleID>/`；**hidden** → `…/Hidden/`；**shared** → `…/Shared/`。catalog 硬删行时列随 Row 消失（本地磁盘文件不删） |
| `cloud_state` | TEXT | 持久云态，见下表。**列表展示**时 `modified_cloud` 视同 `cloud_only`；任务内 `download_status` 可临时覆盖为「下载中/失败」 |
| `download_status` | TEXT? | 仅**活跃下载 job** 内：`pending` / `failed`；catalog job 或空闲时常为 NULL |
| `active_job_id` | INTEGER? | 绑定本次进程内存 job id；无活跃任务时常 NULL |
| `catalog_scope` | TEXT | catalog **来源分区**（UI 混排、落盘子目录、删云 scope）：`library`（默认个人图库） / `hidden`（Hidden 智能相册） / `shared`（Shared Photo Library） |
| `library_type` | TEXT | CloudKit 库路由：`private` / `shared`（与 `catalog_scope` 相关，download/delete 用） |
| `library_zone` | TEXT | zone 名，默认 `PrimarySync`；共享图库多为 `SharedSync` 等 |
| `contributed_by` | TEXT? | **共享图库**：主贡献者 CloudKit **user recordName**（多贡献者时取数组首个）。策略比对用此列 vs `settings.cloudkitUserRecordId` |
| `contributors_json` | TEXT? | sidecar `contributors` **完整数组 JSON**；`contributed_by` 不够时 SQL/线下排查用。UI 不展示 |
| `zone_owner_record_name` | TEXT? | 该条 catalog 枚举所在 zone 的 owner recordName（共享图库诊断） |
| `skip_reason` | TEXT? | `cloud_state=sync_skipped` 时的机读原因；当前产品值：`shared_other_contributor`（他人贡献且开启「仅本人」） |
| `cpl_asset_record_name` | TEXT? | CloudKit CPL 记录名（删云必需） |
| `cpl_asset_change_tag` | TEXT? | CloudKit change tag |
| `capture_at` / `added_at` | TEXT? | 云侧拍摄 / 加入图库时间 ISO8601 |
| `latitude` / `longitude` | REAL? | WGS84；无 GPS 为 NULL |
| `last_synced_at` | INTEGER? | 最近一次成功落盘时间（Unix 秒） |
| `last_catalog_at` | INTEGER? | 最近一次被 catalog 触及时间（Unix 秒） |
| `last_error` | TEXT? | 最近一次下载失败摘要 |
| `attempt_count` | INTEGER | 下载重试计数，默认 0 |

**`cloud_state` 取值（`assets` 列存字符串）：**

| 值 | 含义 | 是否入队下载 |
|----|------|----------------|
| `cloud_only` | 云上有、本地未同步（或曾 synced 后 reconcile 降级） | 是（全量/子集同步时） |
| `modified_cloud` | **遗留列值**；解析与展示均按 `cloud_only` | 是 |
| `synced` | 已下载且 `dest_path` 与 reconcile 一致 | 否（意图「移除」可操作） |
| `sync_skipped` | 策略跳过（如他人共享贡献） | **否**；配合 `skip_reason` |

入队规则概要：开始同步时 `enqueue_cloud_only_for_sync` 只拉 `cloud_state IN ('cloud_only', 'modified_cloud')`，**不含** `sync_skipped`。

### catalog 刷新时 `assets` 会变多少行？

**不是**「sidecar 返回 N 条就 INSERT N 条新行」。刷新走 **全量枚举 + diff**（`catalog_diff.rs` → `apply_catalog_delta`）：

1. sidecar 按当前设置枚举（个人图库 ± Hidden ± Shared），每条 catalog item 通常对应 `assets` 的一行 `(apple_id, asset_id, part)`；**Live Photo 的 still / mov 各一行**，故 catalog 条数可大于「逻辑照片数」。
2. Rust 与库内已有行按 `(asset_id, part)` 比对指纹 / change tag / 元数据，分为：
   - **Added** → `INSERT`（仅首次见到）；冲突键上 `ON CONFLICT` 会降级为更新（测试/边界）。
   - **Modified** → `UPDATE`，`cloud_state` 置 `cloud_only`（云上有新版本，待重下）。
   - **MetadataRefresh** / **ScopeMigration** → `UPDATE` 元数据或 scope；已 `synced` 的一般**不**强制改回待下载（迁移另可搬迁 `dest_path`）。
   - **Unchanged** → **不逐行 UPDATE**；批量刷新 `last_catalog_at`。
3. **`mark_catalog_deletions`**：在本次 catalog 集合内、且当前开启同步的 scope 里，**云侧已不存在的行 `DELETE FROM assets`**（关闭 Hidden/Shared 开关时，对应 scope **不**参与删行，旧行保留）。
4. 产品路径「**刷新目录**」：`enqueue=false`，**不会**因刷新把行标成 `download_status=pending`；仅云态/metadata 更新。真正入队在「同步到本地」。
5. 刷新末尾可能跑 **共享贡献者跳过策略**（改 `cloud_state` / `skip_reason`，非新增行）。

**排查示例（共享本人/他人）：** `settings.json` 的 `cloudkitUserRecordId` 与 `assets.contributed_by`；需要看完整贡献者列表时读 `contributors_json`。

### 临时表（连接级，可视化工具通常看不到持久行）

| 表 | 作用 |
|----|------|
| `catalog_keys_temp` | 本次 catalog 仍存在的 `(asset_id, part)` 集合；diff / reconcile 用，避免 N 次逐行 SQL |
| `catalog_touch_temp` | catalog 落库时「本批触及」键集合，用于批量更新 `last_catalog_at` 等 |

会话结束即失效；不必备份。

---

## 任务（非表 · `job_mem`）

实现：`src-tauri/src/icloud_sync/job_mem.rs`

| 字段（逻辑） | 含义 |
|--------------|------|
| `task_type` | `sync` / `catalog`（删云**不入** job，见 cloudSyncFlow） |
| `view` / `output_dir` / `apple_id` | 任务视图、本地下载目录、账号 |
| `status` | cataloging / pending / running / paused_* / done / failed |
| `total_count` 等 | 进度计数（UI 状态卡） |
| `created_at` / `finished_at` | 起止时间 |

同一 Apple ID 同时至多一条未完成内存任务；删云用独立内存旗标与 sync/catalog 互斥。

---

## settings.json（iCloud 同步配置）

实现：`src-tauri/src/icloud_sync/settings.rs` · 前端 `api/icloudSync.ts` · 路径 `<appData>/icloud-sync/settings.json`

| 字段 | 含义 |
|------|------|
| `appleId` | 当前/上次使用的 Apple ID（明文；密码在钥匙串） |
| `icloudDomain` | 产品固定 `cn`（icloud.com.cn）；读盘时强制规范化 |
| `rememberPassword` | 登录成功后是否把密码写入钥匙串 |
| `syncHiddenAlbum` | `true` 时 catalog 合并 Hidden 相册；关闭后不再刷新 hidden scope，已下载保留 |
| `syncSharedLibrary` | `true` 时 catalog 合并 Shared Photo Library（SharedSync 等 zone） |
| `syncSharedOnlyOwnContributions` | `true` 且上项为真时：共享项中 `contributed_by` 非空且 ≠ `cloudkitUserRecordId` → `assets` 标 `sync_skipped`；**`contributed_by` 为空不误标** |
| `batchRemoveSkipRecentYear` | iCloud 批量下载/移除时跳过近一年内资源 |
| `cloudkitUserRecordId` | 本账号 CloudKit **user recordName**（如 `_2115399d…`）。catalog 完成时 sidecar `PrimarySync.ownerRecordName` → Rust **自动写入**；「仅本人贡献」策略的比对基准。**不在 `assets` 表** |

落盘目录**不在**此文件：写死 `{albumRoot}/iCloudSync`（相册根来自 CS 应用设置；hidden/shared 子目录见 `assets.dest_path`）。

相关非 JSON 文件（同 `icloud-sync/` 目录）：`state.db`、sidecar **session** 目录（登录 cookie，见 `loginFlow.md`）。

---

## 一览

```text
media.db
└── media                 本地文件索引 + 展示缓存 + meta

state.db
├── assets                  同步资源注册 + 下载/跳过态（含 contributed_by / contributors_json）
└── (temp) catalog_*        catalog 批处理辅助

<appData>/icloud-sync/settings.json
└── syncHiddenAlbum / syncSharedLibrary / syncSharedOnlyOwnContributions
    cloudkitUserRecordId      本账号 CloudKit id（策略比对，不进 assets）

进程内存 job_mem
└── JobRow                同步 / 刷新目录任务头（不落盘）
```
