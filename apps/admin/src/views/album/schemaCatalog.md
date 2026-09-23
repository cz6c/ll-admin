# 相册相关 SQLite 表目录

> **职责：** 陈列 `media.db` / `state.db` 各表作用（给人与可视化工具对照用）。  
> **不合并：** 两库职责分离，见下文边界。  
> **对齐：** 2026-09-23  
> 流程：[本地扫描](./loadingFlow.md) · [云同步](./cloudSyncFlow.md) · [登录](./loginFlow.md)

SQLite 无标准表/列 COMMENT；用本文当描述 SSOT。

---

## 边界

| 库 | 路径 | 管什么 |
|----|------|--------|
| **media.db** | `<appData>/album/media.db` | 本地相册根上的文件索引、缩略图/代理缓存路径、展示用 meta |
| **state.db** | `<appData>/icloud-sync/state.db` | iCloud 账号下的资产注册（catalog 真相）与下载态 |

跨库关联（非 FK）：下载入库时把云侧身份写入 `media.origin*`；之后 **media 与 sync 解耦**（不再为 capture 反查 `dest_path`）。`media.path` 与 `assets.dest_path` 仅在「仍已同步且未硬删」时可能重合。

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
| `fail_count` | 缩略图连续失败；≥2 跳过 |
| `scanned_at` | 最近索引时间 |

清库：可删整个 `media.db` 后 force 重扫（不碰 `state.db`）。

---

## state.db（iCloud 同步）

实现：`src-tauri/src/icloud_sync/db.rs`

### Schema 策略

- **不读不写** `PRAGMA user_version`；**不建** `jobs` 表。
- 打开时：无 `assets` 才建表；已有表直接用、**不改结构**。
- 任务状态：仅 `job_mem`（进程内 `HashMap`）；`assets.active_job_id` 可指向本次进程的内存 job id。

### `assets`

**作用：** iCloud 图库在本地的资产注册表（catalog 真相）。一行一个 `(apple_id, asset_id, part)`；Live 的 still / mov **各一行**。驱动「待同步 / 已同步 / 云态」、下载入队与 `dest_path` 落盘记录。

| 列（摘要） | 含义 |
|------------|------|
| `asset_id` + `part` | 云侧主键分量（part 区分 still/mov 等） |
| `media_kind` / `live_pair_id` | 类型与 Live 配对 |
| `original_filename` / `sort_key` | 展示与排序 |
| `dest_path` | 已下载本地绝对路径；删云/catalog 硬删行时一并消失（本地 media/文件不动） |
| `cloud_state` | `cloud_only` / `synced` |
| `download_status` / `active_job_id` | 当前下载态与所属**内存** job |
| `cpl_asset_*` | CloudKit 记录名 / change tag |
| `capture_at` / `added_at` | 云侧拍摄/加入时间 |
| `latitude` / `longitude` | 可选 GPS |
| `last_error` / `attempt_count` | 失败与重试 |

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

## 一览

```text
media.db
└── media                 本地文件索引 + 展示缓存 + meta

state.db
└── assets                iCloud 资产注册 + 下载态
    └── (temp) catalog_*  catalog 批处理辅助

进程内存 job_mem
└── JobRow                同步 / 刷新目录任务头（不落盘）
```
