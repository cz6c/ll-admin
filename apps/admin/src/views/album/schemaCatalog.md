# 相册相关 SQLite 表目录

> **职责：** 陈列 `media.db` / `state.db` 各表作用（给人与可视化工具对照用）。  
> **不合并：** 两库职责分离，见下文边界。  
> **对齐：** 2026-09-15  
> 流程：[本地扫描](./loadingFlow.md) · [云同步](./cloudSyncFlow.md) · [登录](./loginFlow.md)

SQLite 无标准表/列 COMMENT；用本文当描述 SSOT。

---

## 边界

| 库 | 路径 | 管什么 |
|----|------|--------|
| **media.db** | `<appData>/album/media.db` | 本地相册根上的文件索引、缩略图/代理缓存路径、展示用 meta |
| **state.db** | `<appData>/icloud-sync/state.db` | iCloud 账号下的资产注册、同步/删云任务与队列 |

跨库关联（非 FK）：下载入库时把云侧身份写入 `media.origin*`；之后 **media 与 sync 解耦**（不再为 capture 反查 `dest_path`）。`media.path` 与 `assets.dest_path` 仅在「仍已同步且未硬删」时可能重合。

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
| `thumb_path` / `preview_path` | 宫格 WebP；HEIC 全尺寸 JPEG |
| `video_path` | Live 配对 mov 路径 |
| `playback_path` | H.264 播放代理（单独视频或 Live mov） |
| `capture_at` / `camera` | 拍摄时间 / 机型（仅补空：本表已有 → origin → EXIF → 文件名前缀；用户可覆盖写 `capture_at`） |
| `capture_at_source` | `origin` / `exif` / `filename` / `user` |
| `capture_at_probed` | 已探测拍摄时间 |
| `origin` / `origin_asset_id` / `origin_account` / `origin_album` | 同步下载入库时复制的云侧身份；catalog 刷新后仍留在本表 |
| `added_at` / `latitude` / `longitude` | 下载时从云侧 catalog 带入（仅补空） |
| `width` / `height` | 图=解码；单独视频=打开时 ffprobe |
| `content_hash` / `hash_algo` | 重复清理用 BLAKE3 |
| `fail_count` | 缩略图连续失败；≥3 跳过 |
| `scanned_at` | 最近索引时间 |

清库：可删整个 `media.db` 后 force 重扫（不碰 `state.db`）。

---

## state.db（iCloud 同步）

实现：`src-tauri/src/icloud_sync/db.rs`（`PRAGMA user_version = 5`）

### 版本（非表）

**作用：** schema 代际存在文件头 `PRAGMA user_version`（不再使用 `schema_meta` 表）。  
打开时：旧库若仍有 `schema_meta` 则一次性灌入 pragma（仅当 `user_version=0`）并 `DROP`。  
**只认终态 `user_version = 5`**（已砍 v2–v4 自动迁移与 `index_num` 残留清理）。  
wipe：仅无业务表建终态，或 `user_version∈{0,1}` 的不可识别旧形态；其它低版本报错不清空。

### `jobs`

**作用：** 同步相关任务头。同一 Apple ID 同时至多一条未完成任务（sync / catalog / 删云等互斥）。

| 列（摘要） | 含义 |
|------------|------|
| `task_type` | 如 `sync` / catalog / 删云类 |
| `view` / `output_dir` / `apple_id` | 任务视图、本地下载目录、账号 |
| `status` | 进行中 / 完成 / 取消等 |
| `total_count` 等 | 进度计数（UI 状态卡） |
| `created_at` / `finished_at` | 起止时间 |

### `assets`

**作用：** iCloud 图库在本地的资产注册表（catalog 真相）。一行一个 `(apple_id, asset_id, part)`；Live 的 still / mov **各一行**。驱动「待同步 / 已同步 / 云态」、下载入队与 `dest_path` 落盘记录。

| 列（摘要） | 含义 |
|------------|------|
| `asset_id` + `part` | 云侧主键分量（part 区分 still/mov 等） |
| `media_kind` / `live_pair_id` | 类型与 Live 配对 |
| `original_filename` / `sort_key` | 展示与排序 |
| `dest_path` | 已下载本地绝对路径；删云/catalog 硬删行时一并消失（本地 media/文件不动） |
| `cloud_state` | `cloud_only` / `synced`（旧 `cloud_delete_queued` / `failed_delete` / `deleted_cloud_pending` 打开库 scrub） |
| `download_status` / `active_job_id` | 当前下载态与所属 job |
| `cpl_asset_*` | CloudKit 记录名 / change tag |
| `capture_at` / `added_at` | 云侧拍摄/加入时间 |
| `latitude` / `longitude` | 可选 GPS |
| `last_error` / `attempt_count` | 失败与重试 |

### 临时表（连接级，可视化工具通常看不到持久行）

| 表 | 作用 |
|----|------|
| `catalog_keys_temp` | 本次 catalog 仍存在的 `(asset_id, part)` 集合；diff / reconcile / 删云标记用，避免 N 次逐行 SQL |
| `catalog_touch_temp` | catalog 落库时「本批触及」键集合，用于批量更新 `last_catalog_at` 等 |

会话结束即失效；不必备份。

---

## 一览

```text
media.db
└── media                 本地文件索引 + 展示缓存 + meta

state.db
├── （文件头）user_version  schema 代际（现 = 6）
├── jobs                  同步 / 刷新目录任务头
├── assets                iCloud 资产注册 + 下载态
└── (temp) catalog_*      catalog 批处理辅助
```
