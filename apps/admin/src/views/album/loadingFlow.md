# 本地相册 — 加载与扫描流程

> **职责：** 扫描本地根目录 → 秒出宫格 → 后台补缩略图 / HEIC 预览。  
> **页面：** `index.vue` · `MediaViewer.vue` · `LivePhotoPlayer.vue`  
> **实现：** `src-tauri/src/album/`（mod / scanner / thumbnail / db / watcher / ffmpeg …）  
> **前置：** 设置页已配 `rootDir`；HEIC 建议有捆绑 `ffmpeg`  
> **对齐：** 2026-08-26

姊妹文档：[下载](./downloadFlow.md) · [登录](../../components/IcloudSyncAuthModal/loginFlow.md)

---

## 一眼看懂

```mermaid
flowchart LR
  A[进入页 / 目录变更] --> B[album_scan]
  B --> C[discover 同步返回列表]
  C --> D[宫格可见]
  C --> E[后台 pipeline]
  E --> F[thumb-ready 逐条补图]
  D --> G[点击 → MediaViewer]
```

| 步 | 发生什么 | 用户看到 |
|----|----------|----------|
| 1 | `album_cancel_scan` + bump **pipeline epoch** + 等旧任务（≤65s） | — |
| 2 | **discover**：WalkDir → SQLite 复用缓存 → Live 配对 → 批量 upsert | 全页 loading |
| 3 | 返回 `MediaGroup[]`，启动 watcher（trailing 2s debounce） | **宫格出现**（虚拟滚动） |
| 4 | **pipeline**：缺 thumb / HEIC 缺 preview 的并行生成 | 顶部进度条；占位 → 实图 |
| 5 | 每条成功：`update_cache_paths` + `album://thumb-ready` | 对应卡片刷新 |
| 6 | 点击卡片 → Viewer（图 / 视频 / Live） | 全屏预览 |

**硬规则（改代码勿破）：**

1. 两阶段：discover 阻塞 invoke；缩略图绝不挡首屏。  
2. IPC **不传 base64**，只传路径 + `convertFileSrc`。  
3. 增量索引：`path + size + modified`；失败计数 ≥3 跳过坏文件。  
4. 新扫描换 **新 cancel token + epoch**；过期 pipeline 禁止写库 / emit。  
5. 取消 ≠ 失败；仅真实解码失败才 `fail_count++`。

---

## 速查

### UI 阶段

| 阶段 | `phase` | 全页 loading | 宫格 |
|------|---------|--------------|------|
| 未配根目录 | — | 空态 | 无 |
| discover | `discover` | 是 | 否 |
| 缩略图中 | `thumbnails` | 否 | **是** |
| 完成 | — | 否 | 是 |

### 事件 / 命令

| 事件 | 前端 |
|------|------|
| `album://scan-progress` | 进度条文案 |
| `album://thumb-ready` | `pathIndex` O(1) 写回 thumb/preview |
| `album://files-changed` | `scan()`（进行中则排队一次） |

| 命令 | 作用 |
|------|------|
| `album_scan` | discover + 后台 pipeline |
| `album_cancel_scan` | 取消缩略图 |
| `album_ensure_preview` | HEIC 兜底（正常扫描期已生成） |
| `album_get/save_settings` | `rootDir` 等 |

### 缓存路径

```text
thumbs/v{ALBUM_CACHE_VERSION}/{hash}.webp          # 网格
thumbs/v{ALBUM_CACHE_VERSION}/{hash}_full.jpg     # 仅 HEIC
hash ← version + path + modified + size
```

---

## 细节（按需）

### discover

1. 开 `media.db`，`load_indexed_paths`；跳过 `SKIP_DIRS`。  
2. 扩展名 ∈ `IMAGE_EXTS` ∪ `VIDEO_EXTS`。  
3. 索引命中且缓存文件在 → 带上 `thumbPath` / `previewPath`。  
4. 每目录 `pair_live_photos` → 分组 → `delete_stale_paths` + **事务批量 upsert**（WAL）。

### pipeline

1. 跳过 `fail_count ≥ FAIL_THRESHOLD(3)`。  
2. 收集：无 thumb，或 HEIC 无 preview。  
3. 2–8 路并行 `generate_thumbnail`：图 / HEIC（ffmpeg→WIC）/ 视频首帧。  
4. **thumb 或 preview 任一成功** 即落库 + emit；`cancelled` 不计失败。  
5. 写副作用前校验 `pipeline_epoch == my_epoch`。

### Live 配对（同目录）

任一命中即 `kind=livephoto`，MOV 从列表剔除：

- stem 相同，或去掉 `_hevc` / `_heic` / `_mov` 后相同  
- iCloud 五位序号前缀相同（如 `00003_`）

未配对 MOV 仍为 `video`。

### HEIC / ffmpeg

| 项 | 说明 |
|----|------|
| 解析 | 捆绑 `resources/ffmpeg.exe` → 资源目录 → PATH |
| 开发 | `pnpm run cs:ffmpeg-fetch` |
| 解码 | **不加 `-map`**（否则 512 瓦片）；超时 60s |
| 回退 | `heic_decode`（WIC）；Viewer 用 `previewPath`，不能直接渲 HEIC |

### Viewer

| kind | 源 |
|------|----|
| image | `path`；HEIC → `previewPath` |
| video | `<video>` |
| livephoto | `LivePhotoPlayer`（静帧 + MOV） |

键盘：`Esc` / `←` `→`；范围 = 当前目录扁平列表。

---

## 排查

| 现象 | 处理 |
|------|------|
| 宫格长期占位 | 看缩略图进度；查 ffmpeg |
| HEIC 空白 | 等 preview；或清缓存重扫 |
| HEIC 只有 512×512 | 清 `thumbs/v*` 重扫 |
| 文件数不对 | 查扩展名白名单 |
| 改文件不刷新 | 确认在根目录子树；等 2s debounce |
| db 与缓存不一致 | 同时删 `thumbs/` + `media.db` |

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\com.ll.admin\album\thumbs"
Remove-Item -Force "$env:APPDATA\com.ll.admin\album\media.db" -ErrorAction SilentlyContinue
```

| 路径 | 内容 |
|------|------|
| `<appData>/album/settings.json` | rootDir |
| `<appData>/album/media.db` | 索引 + fail_count |
| `<appData>/album/thumbs/v3/` | WebP + HEIC full |
| `{rootDir}/` | 用户相册根 |

调试：`pnpm run cs:dev` · `cargo test album::` · `cargo check`
