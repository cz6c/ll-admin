# QQ 空间同步 — 第二备份源（MVP）

> **产品目的：** 与 iCloud 并列，把 **本人** QQ 空间相册原图/视频 **单向同步到本地**，供本地相册扫描浏览。  
> **页面：** `index.vue` + `QzoneSyncFab.vue`  
> **实现：** `src-tauri/src/qzone_sync/*` · `api/qzoneSync.ts`  
> **不涉及：** 好友相册、动态、上传、删远端；**不嵌入** GPL 第三方客户端源码。  
> **对齐决策：** 平行 Tauri 模块 + **扫码登录** + 独立 FAB；浏览交互参考开源客户端左右布局  

姊妹文档：[iCloud 同步](./cloudSyncFlow.md) · [本地扫描](./loadingFlow.md)

---

## 实现前调研门禁（强制）

后续凡 QQ 空间相关能力（登录、列表、预览、下载、命名、错误处理等），**禁止未调研就直接写实现**。顺序固定：

1. **基线**：对照 [QzonePhoto](https://github.com/11273/QzonePhoto) 的**方案与接口用法**（模块边界、调用顺序、字段语义、已知坑）。只学思路与公开 Web API 形态，**禁止复制/粘贴其 GPL 源码进仓**。  
2. **对照**：再查社区是否有更稳/更简方案（如 PyQQSkeyTool、其它相册导出工具、公开协议笔记）；列出与基线的差异与取舍。  
3. **敲定**：有互斥分叉（接口选型、预览策略、登录方式等）时先澄清拍板，再写蓝图/改代码。  
4. **落地**：自研 Rust/Vue 实现；`qzoneSyncFlow.md` 同步记下「对齐了哪条路径、相对基线改了什么」。

> 教训：视频预览曾跳过 floatview，直接用列表 URL → 封面/m3u8 黑屏。基线早有 `cgi_floatview_photo_list_v2` → MP4 `download_url`。

---

## 核心路径

```text
扫码登录
  → 抽屉内浏览：左相册 / 右缩略图（媒体经 Tauri Cookie 代理）
  → 灯箱预览 / 全部下载 / 下载本相册
  → catalog → state.db（cloud_only → synced）
  → 落盘 {albumRoot}/QzoneSync/<uin>/<相册名>/{unix}_{uin8}_{id16}.ext
  → album_scan 发现 → media.db
```

| 原则 | 含义 |
|------|------|
| 单向 | 只「云 → 本地」 |
| 与 iCloud 平行 | 独立 settings / session / state.db / 任务；互不合并 |
| 本地优先 | 已存在非空文件则跳过并标 synced；仍补 mtime / 缺省 EXIF 时间 |
| 合规 | 仅下载有权访问的本人相册；会话只存本机 |
| 时间元数据 | 对齐 QzonePhoto 优先级：`exif.originalTime` → `modifytime` → `rawshoottime`/`shoottime` → `uploadTime`；**无「现在」兜底**。落盘后写文件 mtime；JPEG 仅在缺 `DateTimeOriginal` 时补写。命名仍 `{unix}_{uin8}_{id16}.ext`。说明/Comment 暂不做。相册判重指纹为 `blake3-no-meta-v1`（JPEG/PNG 去 EXIF/说明类元数据后再哈希），故补写前后可同组 |

---

## 登录

1. 抽屉打开 → `qzone_sync_qr_start` 拉 ptlogin2 二维码  
2. 前端每 2s `qzone_sync_qr_poll`（waiting / scanned / expired / success）  
3. success：对 `check_sig` **单次 GET 且不跟跳**取 Cookie（对齐 [PyQQSkeyTool](https://github.com/sun589/PyQQSkeyTool) `getCookies`）→ probe 相册列表 → 落 `session.json`  

> 参数：`appid=549000912` / `daid=5` / `u1=qzs…loginsucc.html?para=izone`。勿跟到 loginsucc，避免空 `p_skey` 覆盖。

## 浏览与下载

| 能力 | 命令 / 行为 |
|------|-------------|
| 相册列表 | `qzone_sync_list_albums` |
| 相片列表 | `qzone_sync_list_photos`（含 `captureAt`，右侧按日时间轴） |
| 缩略图/灯箱 | 图：`QzoneLazyImg`→`BaseImage`+`qzoneimg`；视频：`cgi_floatview_photo_list_v2` 取 MP4 `download_url` → `prepare_preview` 落盘 → `convertFileSrc`（列表 URL 常为封面/m3u8，勿直接塞 `<video>`） |
| 全部下载 | `qzone_sync_start_job`（`albumId=null`） |
| 本相册下载 | `qzone_sync_start_job`（传入 `albumId`） |

抽屉约 960px；顶栏状态卡对齐 iCloud（标题/主操作/进度统计）；账号在抽屉右上角；「刷新目录」重拉相册列表与当前相册内容。下载中可暂停 / 继续 / 取消。

> **当前任务模型：** 全局**单 worker**（与 iCloud 类似）：`全部下载` = 一次 catalog 全相册再下载；`下载本相册` = 仅该 `albumId`。尚不支持「勾选多个相册排队并行/串行多任务」。

## 命令一览

| Command | 作用 |
|---------|------|
| `qzone_sync_qr_start` | 开始扫码 |
| `qzone_sync_qr_poll` | 轮询扫码 |
| `qzone_sync_logout` | 清会话 |
| `qzone_sync_list_albums` | 相册列表 |
| `qzone_sync_list_photos` | 相片浏览列表 |
| `qzone_sync_fetch_media` | Cookie 代理媒体 |
| `qzone_sync_prepare_preview` | 视频：floatview→MP4→落盘；返回本地路径 |
| `qzone_sync_start_job` | catalog + 下载（可选相册） |
| `qzone_sync_pause_job` / `resume` / `cancel` | 任务控制 |
| `qzone_sync_job_status` | 快照 |
| `qzone_sync_get/save_settings` | 落盘目录等 |
| `qzone_sync_pending_count` | 待下载计数 |

事件：`qzone-sync://progress` → `QzoneJobSnapshot`

---

## 与相册耦合

- 扫描：`QzoneSync` 输出目录异物收容（命名谓词 `is_sync_asset_filename`）
- meta：按 `dest_path` 查 QQ `state.db` 的 `capture_at`（次于 iCloud 同路径命中）

---

## 验收

1. 扫码登录后左侧出现相册，点选右侧出缩略图  
2. 点击缩略图可灯箱预览（含视频控件）  
3. 「全部下载」/「下载本相册」落盘到 `QzoneSync/`，刷新相册可见  
4. 再次同步跳过已下文件；iCloud 不受影响  
5. `cargo check` 0 warning  
