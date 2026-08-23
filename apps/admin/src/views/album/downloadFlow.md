# iCloud 同步 — 文件下载流程

**适用页面：** `icloudSync.vue`（相册 → iCloud 同步）  
**关联实现：** `apps/admin/src-tauri/src/icloud_sync/queue.rs`、`naming.rs`、`db.rs`；`apps/admin/sidecar/icloudSync/agent.py`  
**前置条件：** 已完成 Apple ID 登录（见 [`loginFlow.md`](../../components/IcloudSyncAuthModal/loginFlow.md)）  
**最后对齐：** 2026-08-22

---

## 0. 设计原则

| 优先级 | 原则 | 实现要点 |
|--------|------|----------|
| P0 | **catalog 一次、下载可续** | 首次 `start_job` 全量枚举图库写入 SQLite；`resume` 不 re-catalog（除非任务无 assets） |
| P0 | **下载不携带密码** | 循环前 `auth_probe`（无密码）；session 失效 → `paused_session`，等用户显式重登 |
| P0 | **串行下载 concurrency=1** | ~~Rust 单线程循环~~ → **P1**：Rust 批量 `download_batch` + sidecar 内 ThreadPoolExecutor（1–3） |
| P1 | **单文件重试** | sidecar `ipdPhotos` 内 HTTP 3 次退避 + 自适应超时 |
| P1 | **失败可追溯** | SQLite `last_error` / `attempt_count`；同步页失败表格 + `icloud_sync_list_failed_assets` |
| P1 | **降限流风险** | 批次间 ≥400ms + 每批成功后随机 sleep **200–800 ms** |
| P1 | **大图库性能** | catalog 后 sidecar 建 `asset_id → PhotoAsset` 缓存；download 不再每次 `photos.all` 全扫 |
| P1 | **断点与磁盘对齐** | 目标文件已存在且非空 → 补记 `done`；resume 时 `reconcile_job_with_disk` |
| P2 | **失败可跳过** | 单文件 `download_failed` 标 `failed` 并继续；`account_locked` / `rate_limited` 整 job `failed` |

### 0.1 进度计数说明（排查「序号不连续」）

- **`done / total` 统计的是资产行（part）**，不是「照片张数」。
- **Live Photo** 同一 `index_num` 对应两行：`still` + `mov`，落盘两个文件。
- **失败行** 标为 `failed`，`list_pending` 跳过，故输出目录可能出现 `00002.mov`、`00004.mov` 而缺 `00001.jpg`。
- 文件名规则：`{index:05d}_{sanitized_stem}.{ext}`（见 `naming.rs`）；MOV 部件扩展名强制 `.mov`。

---

## 1. 架构分层

```text
┌─────────────────────────────────────────────────────────────┐
│  icloudSync.vue                                               │
│  开始/暂停/续传 · 概览/失败表格 · job-status 事件 · localStorage  │
└───────────────────────────┬─────────────────────────────────┘
                            │ invoke + listen events
┌───────────────────────────▼─────────────────────────────────┐
│  Rust icloud_sync/queue.rs                                    │
│  start_job · resume · pause · job_status                       │
│  spawn_catalog_then_download → run_download_loop（批量 download_batch）│
│  SQLite state.db · 命名 · 进度 emit                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ stdin/stdout line-JSON (protocol=1)
┌───────────────────────────▼─────────────────────────────────┐
│  Python sidecar agent.py                                     │
│  catalog：枚举图库 → items[] · 建 photo_cache                  │
│  download：download_batch 并行拉流 → 原子落盘（单条 download 保留给测试）│
└───────────────────────────┬─────────────────────────────────┘
                            ▼
                     iCloud Photos API（pyicloud_ipd）
```

**Sidecar 约束：** `SidecarClient` 内部 `Mutex` 保证同一时刻仅一条 in-flight 请求；sidecar 主循环逐行读 stdin、逐行写 stdout。

---

## 2. 总览流程图

```mermaid
flowchart TD
  A[用户点击「开始同步」] --> B{已登录?}
  B -->|否| C[引导 Apple ID 登录]
  B -->|是| D[icloud_sync_start_job]
  D --> E[insert job · status=cataloging]
  E --> F[立即返回 jobId · UI 不阻塞]
  F --> G[后台线程: sidecar catalog]
  G --> H{items 有效?}
  H -->|否| I[job failed]
  H -->|是| J[catalog_to_asset_rows → SQLite]
  J --> K[job status=pending]
  K --> L[spawn run_download_loop]
  L --> M[auth_probe]
  M -->|session 失效| N[paused_session]
  M -->|ok| O[job status=running]
  O --> P[取 pending 队首]
  P --> Q{磁盘已有文件?}
  Q -->|是| R[补记 done · 下一项]
  Q -->|否| S[sidecar download]
  S -->|ok| T[mark done · emit progress]
  S -->|auth 错误| N
  S -->|fatal| I
  S -->|download_failed| U[mark failed · 继续]
  T --> V[sleep 200-800ms]
  U --> V
  R --> P
  V --> W{pause 请求?}
  W -->|是| X[paused_user]
  W -->|否| Y{pending 空?}
  Y -->|是| Z[done]
  Y -->|否| P
```

---

## 3. 任务状态机

```mermaid
stateDiagram-v2
  [*] --> cataloging: start_job
  cataloging --> pending: catalog 成功落库
  cataloging --> failed: catalog 失败

  pending --> running: download_loop 开始
  running --> done: pending 为空
  running --> paused_user: 用户 pause
  running --> paused_session: session/2FA/sidecar 崩溃
  running --> failed: account_locked / rate_limited

  paused_user --> pending: resume（reset failed→pending）
  paused_session --> pending: 用户重登后 resume

  note right of cataloging
    枚举图库阶段
    progress.total 可能仍为 0
  end note

  note right of paused_session
    保留 SQLite 进度
    不自动重登
  end note
```

| status | 含义 | 用户动作 |
|--------|------|----------|
| `cataloging` | 后台扫描 iCloud 图库 | 等待；可正常操作窗口 |
| `pending` | 已建库，下载线程即将/正在启动 | — |
| `running` | 串行下载中 | 可「暂停同步」 |
| `paused_user` | 用户手动暂停 | 「继续同步」 |
| `paused_session` | 登录/session 失效 | 重新登录 → 「继续同步」 |
| `done` | 全部 pending 处理完（含磁盘 reconcile） | 可新建任务 |
| `failed` | 锁定/限流或 catalog 失败 | 新建任务；勿盲目 resume |

---

## 4. Catalog 阶段

### 4.1 触发与视图

- 入口：`icloud_sync_start_job(view)`，当前 UI 固定 **`library`**（按拍摄时间 `capture_at` 排序）。
- 可选视图：`library` | `recents`（按 `added_at`）；二者互斥，由 job 行 `view` 字段记录。

### 4.2 Sidecar 命令

```json
{
  "cmd": "catalog",
  "view": "library",
  "apple_id": "user@example.com",
  "session_dir": "<appData>/icloud-sync/session"
}
```

**成功响应：**

```json
{
  "type": "done",
  "cmd": "catalog",
  "items": [
    {
      "asset_id": "…",
      "filename": "IMG_0027.HEIC",
      "media_kind": "live",
      "live_pair_id": "…",
      "capture_at": "2024-01-01T12:00:00Z",
      "added_at": "2024-01-02T08:00:00Z",
      "parts": ["still", "mov"]
    }
  ]
}
```

### 4.3 媒体类型与 parts

识别逻辑与 icloudpd 一致（见 `ipdPhotos.ipd_media_kind`）：

| 条件 | media_kind | parts |
|------|------------|-------|
| `item_type == MOVIE` | `video` | `["video"]` |
| `IMAGE` 且 versions 含 `LivePhotoVersionSize.ORIGINAL` | `live` | `["still", "mov"]` |
| 其它 `IMAGE` | `photo` | `["still"]` |

| media_kind | parts | SQLite 行数 | 说明 |
|------------|-------|-------------|------|
|------------|-------|-------------|------|
| `photo` | `["still"]` | 1 | 普通照片 |
| `video` | `["video"]` | 1 | 独立视频 |
| `live` | `["still", "mov"]` | 2 | 同 `index_num`，先 still 后 mov |

### 4.4 Rust 落库规则

1. 按视图排序键升序：`library` → `capture_at`，`recents` → `added_at`。
2. 每条 catalog 校验：排序字段非空；`live` 必须有 `live_pair_id`。
3. 顺序分配 `index_num` = 1, 2, 3…（**按 catalog 条目**，Live 两行共享同一 index）。
4. 写入 `assets` 表，初始 `status=pending`。
5. catalog 完成后 sidecar 调用 `_refresh_photo_cache`，供后续 download O(1) 定位。

### 4.5 耗时预期

- 全量 `api.photos.all` 迭代；~5000 张规模通常 **数分钟**。
- 此阶段 `progress.total` 可能为 0；UI 显示「正在扫描 iCloud 图库…」。

---

## 5. Download 阶段

### 5.1 循环逻辑（`run_download_loop`）

```text
1. ensure_sidecar + auth_probe
2. set job → running
3. loop:
     a. 检查 pause 标志 → paused_user
     b. list_pending（ORDER BY index_num, still<mov）
     c. 队首：磁盘已有有效文件 → mark done，continue
     d. sidecar download → dest_path
     e. 成功 → mark done；auth 错 → paused_session；fatal → failed；其它 → mark failed 继续
     f. sleep 200–800ms
4. pending 空 → done
```

### 5.2 Sidecar 命令

```json
{
  "cmd": "download",
  "asset_id": "<icloud asset id>",
  "part": "still | mov | video",
  "dest_path": "E:\\testFiles\\iCloudSync\\00001_IMG_0027.heic",
  "apple_id": "user@example.com",
  "session_dir": "<appData>/icloud-sync/session"
}
```

**part 映射（Rust → sidecar）：**

| AssetPart | media_kind | sidecar part |
|-----------|------------|--------------|
| Still | Photo / Live | `still` |
| Mov | Live | `mov` |
| Full | Photo | `still` |
| Full | Video | `video` |

### 5.3 落盘与命名

- **目标路径：** `{output_dir}/{index:05d}_{stem}.{ext}`
- **stem：** iCloud 原文件名去扩展名，经 Windows 非法字符清洗（`naming.rs`）。
- **Live mov：** 扩展名强制 `mov`，与 still 的 heic/jpg 无关。
- **下载 API（2026-08-22 对齐 icloudpd）：** sidecar 经 `ipdPhotos.py` 使用 `photo.versions_with_raw_policy(AS_IS)` + `photo.download(api.photos.session, version.url)`；**不再**使用 picklepete/pyicloud 的 `photo.download()` 无参或 `download_url("original_video")` 手写路径。
- **原子写入：** sidecar 先写 `*.partial`，再 `os.replace`；失败删 partial。
- **超时：** Rust 等 sidecar 响应 timeout **120s**。

### 5.4 输出目录

优先级：

1. 设置页 `outputDir`（`settings.json`）
2. 默认 `{albumRoot}/iCloudSync`（相册根未配置则 start 报错）

配置入口：相册 → **同步设置**（`settings.vue`）。

---

## 6. 暂停 / 续传 / 换号

### 6.1 暂停（`icloud_sync_pause_job`）

- `running` / `pending`：设置协作式 pause 标志；下载循环在 iteration 边界退出 → `paused_user`。
- `cataloging`：**不可暂停**（需等 catalog 完成或失败）。

### 6.2 续传（`icloud_sync_resume_job`）

- 允许状态：`paused_session` | `paused_user` | `pending` | `running`（后者用于恢复卡住的线程）。
- **`reset_failed_to_pending`**：失败行重新入队。
- **`reconcile_job_with_disk`**：pending 行若磁盘已有文件则补 done；若全部完成直接 → `done`。
- **不 re-catalog**：除非 job 无任何 assets 行（应改用 `start_job`）。

### 6.3 账号一致性

- job 创建时的 `apple_id` 必须与当前 settings 一致；否则 `account_mismatch`，UI 禁止 resume，需新建任务。
- 换号前应先 **logout**（见 loginFlow）。

---

## 7. 前端事件与持久化

### 7.1 Tauri 事件

| 事件 | 常量 | 负载 |
|------|------|------|
| 进度 | `icloud-sync://progress` | `{ done, total, filename }` |
| 任务状态 | `icloud-sync://job-status` | `{ jobId, status, appleId, total, done, failed, pending }` |

### 7.2 localStorage

| Key | 用途 |
|-----|------|
| `icloud-sync.activeJobId` | 当前任务 id；页面 mount 时恢复查询 |

### 7.3 后台通知

`useIcloudSyncBackgroundAlert.ts` 在 `done` / `paused_session` / `failed` 时 OS 通知（`paused_user` 不通知）。

---

## 8. SQLite 结构（`state.db`）

路径：`<appData>/icloud-sync/state.db`

**jobs**

| 列 | 说明 |
|----|------|
| id | 自增 jobId |
| view | `library` / `recents` |
| output_dir | 落盘绝对路径 |
| apple_id | 创建任务时的账号 |
| status | 见 §3 |
| created_at | Unix 时间戳 |

**assets**

| 列 | 说明 |
|----|------|
| asset_id | iCloud 资产 ID |
| sort_key | 排序键快照 |
| original_filename | iCloud 原名 |
| media_kind | photo / video / live |
| live_pair_id | Live 绑定 ID |
| index_num | 序号（Live 两行相同） |
| part | still / mov / full |
| status | pending / done / failed |
| dest_path | 完成后绝对路径 |

唯一约束：`(job_id, asset_id, part)`。

**手工排查 SQL 示例：**

```sql
-- 某 job 失败项
SELECT index_num, part, original_filename, status FROM assets
WHERE job_id = ? AND status = 'failed'
ORDER BY index_num;

-- 进度统计
SELECT status, COUNT(*) FROM assets WHERE job_id = ? GROUP BY status;
```

---

## 9. 错误码与排查

| code | 阶段 | 含义 | 建议动作 |
|------|------|------|----------|
| `catalog_sort_missing` | catalog | 缺 capture_at/added_at | 换视图或稍后重试；查 sidecar 日志 |
| `live_bind_missing` | catalog/download | Live 缺绑定字段 | 升级 sidecar；若单张资产问题会 skip failed |
| `session_expired` | download | session 失效 | 重登 → resume |
| `auth_failed` | catalog/download | 未 auth 或 probe 失败 | 确认已登录；logout 后重登 |
| `need_2fa` | download | 待 2FA | 打开登录弹窗提交验证码 |
| `download_failed` | download | 单文件 IO/API 失败 | 看 sidecar stderr；resume 会重试 failed |
| `account_locked` | 任意 | 账号锁定 | **停止**；iforgot.apple.com |
| `rate_limited` | 任意 | 限流 | 等待数小时；勿连点同步 |
| `sidecar_crashed` | 任意 | sidecar 无响应/退出 | 重启应用；dev 下重启 `cs:dev` |
| `sidecar_missing` | 启动 | 找不到 agent | 打包环境重装；dev 检查 sidecar 构建 |
| `account_mismatch` | resume | 任务账号 ≠ 当前账号 | 新建同步任务 |

### 9.1 常见问题

**Q：点开始同步后很久 progress 为 0？**  
A：处于 `cataloging`；大图库枚举需数分钟，属正常。若超过 10 分钟无变化，查 sidecar 是否存活（120s 超时会有 `sidecar_crashed`）。

**Q：只有 `.mov` 没有对应 `.heic`？**  
A：Live 的 still 可能 failed 或仍在 pending；查 SQLite failed 行或等下载完成。

**Q：重复下载同一文件？**  
A：检查 `dest_path` 是否与命名规则一致；非空文件应被 `mark_asset_done_if_on_disk` 跳过。

**Q：中文路径乱码/写错目录？**  
A：sidecar 已强制 stdin UTF-8；若仍异常，检查 `ICLOUD_SYNC_AGENT_CMD` 与 Windows 区域设置。

**Q：改 Rust/agent 后行为未变？**  
A：dev 需重启 `pnpm run cs:dev`；sidecar Python 改动需重启进程；发布版需 `pnpm run cs:sidecar-build`。

---

## 10. 本地路径速查

| 路径 | 内容 |
|------|------|
| `<appData>/icloud-sync/settings.json` | outputDir、appleId、icloudDomain 等 |
| `<appData>/icloud-sync/session/` | pyicloud session（按 Apple ID） |
| `<appData>/icloud-sync/state.db` | jobs + assets 进度 |
| `<appData>/icloud-sync/session/auth-diagnostic.json` | 最近一次认证/同步诊断（登录成功、probe、catalog、下载鉴权失败、登出均覆盖） |
| `{outputDir}/` | 下载结果，如 `00002_IMG_0027.mov` |
| keyring | Apple ID 密码（不经 settings） |

`<appData>` 为 Tauri 应用数据目录（Windows 通常在 `%APPDATA%\<app>`）。

---

## 11. 开发调试

| 操作 | 命令 / 环境变量 |
|------|-----------------|
| 开发启动 | `pnpm run cs:dev` |
| 指定 sidecar | `ICLOUD_SYNC_AGENT_CMD=python apps/admin/sidecar/icloudSync/agent.py` |
| Sidecar 单测 | `cd apps/admin/sidecar/icloudSync && pytest` |
| Rust 检查 | `cd apps/admin/src-tauri && cargo check` |
| 打包 sidecar | `pnpm run cs:sidecar-build` |

**日志：** Rust `log::error!` 带 `icloud sync job {id}`；sidecar 异常写入 stderr（Rust 断开时附带 stderr tail）。

---

## 12. 相关文档

- [Apple ID 登录流程](../../components/IcloudSyncAuthModal/loginFlow.md) — auth / 2FA / session / auth_probe
- [Sidecar README](../../../sidecar/icloudSync/README.md) — 构建、协议版本、依赖

---

## 13. icloudpd API 对齐审查（2026-08-22）

| 能力 | icloudpd 标准 | sidecar 现状 | 说明 |
|------|---------------|--------------|------|
| 认证 / 2FA / session | `PyiCloudService` + `icloudAuth.py` | ✅ 已对齐 | 见 loginFlow.md |
| 图库枚举 | `api.photos.all` | ✅ 已对齐 | library 视图 |
| 媒体分类 | `item_type` + `LivePhotoVersionSize.ORIGINAL in versions` | ✅ 已对齐 | `ipdPhotos.ipd_media_kind` |
| still / video 下载 | `photo.download(session, version.url)` | ✅ 已对齐 | `AssetVersionSize.ORIGINAL` |
| Live mov 下载 | 同上，`LivePhotoVersionSize.ORIGINAL` | ✅ 已修复 | 不再手写 `resOriginalVidCompl` URL |
| RAW 策略 | `--align-raw as-is` 默认 | ✅ AS_IS | `versions_with_raw_policy` |
| Recents 视图 | icloudpd 多通过 album / list | ⚠️ 部分对齐 | `_iter_view_assets` 有多级 fallback，未逐条对照 icloudpd CLI |
| 断点续传下载 | checksum + `.part` 追加 | ❌ 未实现 | sidecar 单次拉流；大图库弱网可能重下 |
| 下载重试 | icloudpd `constants.WAIT_SECONDS` 循环 | ❌ 未实现 | 失败标 `failed`，靠 resume 重试 |
| Live mov 文件名 `_HEVC` | `--live-photo-mov-filename-policy suffix` | ❌ 未采用 | Rust 命名 `{index}_{stem}.mov`，与 icloudpd 文件名策略不同（序号体系独立） |
| XMP sidecar / EXIF 时间 | `--xmp-sidecar` / `--set-exif-datetime` | ❌ 未实现 | 产品未要求 |
| 并发下载 | icloudpd 线程池 | ❌ P0 固定 1 | Rust 串行 + sidecar Mutex |

**已删除的误用 API（picklepete/pyicloud 遗留）：** `is_live_photo`、`download_url("original_video")`、`photo.download("original")`、无参 `photo.download()`、`_has_live_indicator` 启发式分类。
