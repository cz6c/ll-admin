//! 本地相册
//! 职责：扫描本地目录媒体文件、按子目录分组、识别实况照片；后台缩略图与增量索引
//! 适用：admin CS（Tauri）个人工具

mod media_meta;
mod db;
mod duplicates;
mod ffmpeg;
mod fs_delete;
mod heic_decode;
mod scan_state;
mod scanner;
mod settings;
mod thumbnail;
mod types;
mod watcher;

pub use types::{AlbumSettings, DuplicateGroup, MediaGroup};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use scan_state::ScanCancelToken;
use settings::album_dir;
use tauri::{AppHandle, State};
use watcher::start_watching;

use fs_delete::{purge_cache_file, trash_original_file};

/// 相册运行时状态：扫描取消令牌、文件监听器、后台缩略图任务句柄、写副作用世代
pub struct AlbumState {
  cancel: ScanCancelToken,
  watcher: Option<notify::RecommendedWatcher>,
  pipeline: Option<tokio::task::JoinHandle<()>>,
  /// 每次新扫描递增；旧 pipeline 写库/emit 前校验，过期则丢弃（覆盖 30s 超时残留任务）
  pipeline_epoch: Arc<AtomicU64>,
  /// 根目录自上次 scan 后是否有变动；watcher 落到 true，scan 命中 false 时跳过 WalkDir 走 DB 缓存
  dirty: Arc<AtomicBool>,
  /// 上一次扫描的根目录，切目录时强制全量 discover（dirty 是进程级单标志，不跟 root 绑定）
  last_root: String,
}

impl AlbumState {
  pub fn new() -> Self {
    Self {
      cancel: ScanCancelToken::default(),
      watcher: None,
      pipeline: None,
      pipeline_epoch: Arc::new(AtomicU64::new(0)),
      // 首次必须全扫，初始化为 true
      dirty: Arc::new(AtomicBool::new(true)),
      last_root: String::new(),
    }
  }
}

/// 读取相册设置
#[tauri::command]
pub fn album_get_settings(app: AppHandle) -> Result<AlbumSettings, String> {
  settings::load_settings(&app)
}

/// 保存相册设置
#[tauri::command]
pub fn album_save_settings(
  app: AppHandle,
  state: State<'_, Mutex<AlbumState>>,
  settings: AlbumSettings,
) -> Result<(), String> {
  // rootDir 变化时强制下次 scan 走全量 discover（不跟 dirty 绑定）
  if let Ok(old) = settings::load_settings(&app) {
    if old.root_dir != settings.root_dir {
      if let Ok(mut guard) = state.lock() {
        guard.dirty.store(true, Ordering::SeqCst);
        guard.last_root.clear();
      }
    }
  }
  settings::save_settings(&app, &settings)
}

/// 取消进行中的缩略图后台任务
#[tauri::command]
pub fn album_cancel_scan(state: State<'_, Mutex<AlbumState>>) -> Result<(), String> {
  state.lock().map_err(|e| format!("锁失败: {e}"))?.cancel.cancel();
  Ok(())
}

/// 扫描根目录：先返回文件列表，缩略图后台生成并通过事件推送
/// `force=true` 跳过 dirty 检查走全量 discover（用户手动刷新时传）
#[tauri::command]
pub async fn album_scan(
  app: AppHandle,
  state: State<'_, Mutex<AlbumState>>,
  root: String,
  thumb_size: u32,
  force: Option<bool>,
) -> Result<Vec<MediaGroup>, String> {
  let album_data_dir = album_dir(&app)?;
  let force = force.unwrap_or(false);

  let (dirty_flag, root_changed) = {
    let guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    // last_root 为空（首次 / 设置改 root 后清空）或与当前 root 不同 → 全量 discover
    let root_changed = guard.last_root != root;
    (Arc::clone(&guard.dirty), root_changed)
  };

  // 缓存目录代际迁移：删 thumbs/v*（非当前 vN）+ 清 DB 缓存路径；与 cache_key 公式变更配套 bump
  let mut migrated_here = false;
  {
    let thumbs_dir = album_data_dir.join("thumbs");
    let current_ver = format!("v{}", types::ALBUM_CACHE_VERSION);
    if let Ok(entries) = std::fs::read_dir(&thumbs_dir) {
      for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
          if name != current_ver {
            let _ = std::fs::remove_dir_all(entry.path());
            log::info!("album: removed old cache version dir: {}", name);
            migrated_here = true;
          }
        }
      }
    }
    if migrated_here {
      let album_dir_for_migrate = album_data_dir.clone();
      let _ = tokio::task::spawn_blocking(move || {
        let conn = db::open_db(&album_dir_for_migrate)?;
        db::clear_all_cache_paths(&conn)
      })
      .await;
      dirty_flag.store(true, Ordering::SeqCst);
      log::info!("album: cache version migrated, forcing full discover");
    }
  }

  let need_full_discover = force
    || root_changed
    || migrated_here
    || dirty_flag.load(Ordering::SeqCst);

  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(&app);
  if let Some(path) = &ffmpeg_bin {
    log::debug!("album: HEIC decode via ffmpeg ({})", path.display());
  } else {
    log::warn!(
      "album: ffmpeg 未找到，HEIC 将回退 WIC/sips；开发环境请运行: pnpm run cs:ffmpeg-fetch"
    );
  }

  // 全量路径：先认领当前 dirty（cancel/wait 期间 watcher 再置脏仍留给下次），再停旧 pipeline
  if need_full_discover {
    dirty_flag.store(false, Ordering::SeqCst);
  }

  // 仅在即将启动新 pipeline 时分配 epoch/token；cache_hit 且旧任务仍在跑则两者都不动
  // full_discover：wait 前同一次 lock 完成 cancel+take+bump+token（不可跨 await 持锁）
  let pipeline_slot: Option<(Arc<AtomicU64>, u64, ScanCancelToken)> = if need_full_discover {
    let (old_pipeline, pipeline_epoch, my_epoch, cancel) = {
      let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
      guard.cancel.cancel();
      let old = guard.pipeline.take();
      let my_epoch = guard.pipeline_epoch.fetch_add(1, Ordering::SeqCst) + 1;
      let token = ScanCancelToken::default();
      guard.cancel = token.clone();
      (old, Arc::clone(&guard.pipeline_epoch), my_epoch, token)
    };
    if let Some(handle) = old_pipeline {
      let wait = Duration::from_secs(ffmpeg::FFMPEG_TIMEOUT_SECS + 5);
      let _ = tokio::time::timeout(wait, handle).await;
    }
    Some((pipeline_epoch, my_epoch, cancel))
  } else {
    // cache_hit：读 is_finished 与写 epoch/token 同一把锁，避免中间窗口
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    let should_restart = match &guard.pipeline {
      None => true,
      Some(h) => h.is_finished(),
    };
    if should_restart {
      let my_epoch = guard.pipeline_epoch.fetch_add(1, Ordering::SeqCst) + 1;
      let token = ScanCancelToken::default();
      guard.cancel = token.clone();
      Some((Arc::clone(&guard.pipeline_epoch), my_epoch, token))
    } else {
      None
    }
  };

  let groups = if need_full_discover {
    let app_discover = app.clone();
    let root_discover = root.clone();
    let album_dir_clone = album_data_dir.clone();
    match tokio::task::spawn_blocking(move || {
      scanner::discover_groups(&app_discover, &root_discover, &album_dir_clone)
    })
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))
    .and_then(|r| r)
    {
      Ok(groups) => groups,
      Err(e) => {
        // 失败回滚 dirty，避免下次误走 cache_hit 读旧库
        dirty_flag.store(true, Ordering::SeqCst);
        return Err(e);
      }
    }
  } else {
    let root_for_cache = root.clone();
    let album_dir_for_cache = album_data_dir.clone();
    tokio::task::spawn_blocking(move || {
      let conn = db::open_db(&album_dir_for_cache)?;
      db::load_groups(&conn, &root_for_cache)
    })
    .await
    .map_err(|e| format!("缓存查询任务失败: {e}"))??
  };

  {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.watcher = start_watching(root.clone(), Arc::clone(&guard.dirty));
    guard.last_root = root.clone();
  }

  if let Some((pipeline_epoch, my_epoch, cancel)) = pipeline_slot {
    let app_bg = app.clone();
    let root_for_bg = root.clone();
    let album_dir_for_bg = album_data_dir.clone();
    let groups_bg = groups.clone();
    let handle = tokio::task::spawn_blocking(move || {
      scanner::run_thumbnail_pipeline(
        app_bg,
        root_for_bg,
        album_dir_for_bg,
        thumb_size,
        ffmpeg_bin,
        groups_bg,
        cancel,
        pipeline_epoch,
        my_epoch,
      );
    });
    if let Ok(mut guard) = state.lock() {
      guard.pipeline = Some(handle);
    }
  }

  Ok(groups)
}

fn persist_playback_path(album_data_dir: &std::path::Path, source_path: &str, cache_path: &str) {
  if let Ok(conn) = db::open_db(album_data_dir) {
    let _ = db::update_playback_path(&conn, source_path, cache_path);
  }
}

/// 打开视频时一次 ffprobe 取 codec+分辨率；分辨率落库（仅 path 行存在时生效）
fn probe_and_persist_video_stream(
  album_data_dir: &std::path::Path,
  source_path: &str,
  ffprobe: Option<&std::path::Path>,
) -> (Option<u32>, Option<u32>, Option<String>) {
  let Some(ffprobe) = ffprobe else {
    return (None, None, None);
  };
  let Some(info) =
    ffmpeg::probe_video_stream_info(ffprobe, std::path::Path::new(source_path))
  else {
    return (None, None, None);
  };
  let (width, height) = match (info.width, info.height) {
    (Some(w), Some(h)) => {
      if let Ok(conn) = db::open_db(album_data_dir) {
        let _ = db::update_dimensions(&conn, source_path, w, h);
      }
      (Some(w), Some(h))
    }
    _ => (None, None),
  };
  (width, height, info.codec)
}

fn append_playback_deletes(
  to_remove: &mut Vec<std::path::PathBuf>,
  album_data_dir: &std::path::Path,
  source_path: &str,
  db_playback: Option<String>,
) {
  if let Some(p) = db_playback.filter(|s| !s.is_empty()) {
    let pb = std::path::PathBuf::from(&p);
    if !to_remove.iter().any(|x| x == &pb) {
      to_remove.push(pb);
    }
  }
  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{}", types::ALBUM_CACHE_VERSION));
  if let Some(derived) = thumbnail::probe_playback_cache(&cache_dir, source_path) {
    let pb = std::path::PathBuf::from(derived);
    if !to_remove.iter().any(|x| x == &pb) {
      to_remove.push(pb);
    }
  }
}

/// 删除本地媒体文件及 media.db 索引（不触碰 iCloud sync assets）
/// @param paths 主文件绝对路径；Live Photo 会一并处理 video_path 与播放代理
/// @note 原文件（主路径 + Live mov）→ 回收站；thumb/preview/playback 缓存 → 永久删除
#[tauri::command]
pub fn album_delete_local(
  app: AppHandle,
  state: State<'_, Mutex<AlbumState>>,
  paths: Vec<String>,
) -> Result<u32, String> {
  if paths.is_empty() {
    return Ok(0);
  }
  let album_data_dir = album_dir(&app)?;
  let mut deleted = 0u32;
  let conn = db::open_db(&album_data_dir)?;

  for path in paths {
    let path = path.trim();
    if path.is_empty() {
      continue;
    }
    let (thumb, preview, video, playback) = db::get_media_companion_paths(&conn, path)?;

    // 原媒体：主文件 + Live 配对 mov → 回收站
    let mut originals: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(path)];
    let video_path = video.filter(|s| !s.is_empty() && s != path);
    if let Some(ref v) = video_path {
      originals.push(std::path::PathBuf::from(v));
    }

    // 派生缓存：thumb / preview / playback（含磁盘探测到的 _play.mp4）→ 永久删
    let mut caches: Vec<std::path::PathBuf> = Vec::new();
    for p in [thumb, preview, playback].into_iter().flatten() {
      if !p.is_empty() {
        let pb = std::path::PathBuf::from(&p);
        if !caches.iter().any(|x| x == &pb) {
          caches.push(pb);
        }
      }
    }
    if let Some(ref v) = video_path {
      append_playback_deletes(&mut caches, &album_data_dir, v, None);
    }
    append_playback_deletes(&mut caches, &album_data_dir, path, None);

    for p in &originals {
      trash_original_file(p)?;
    }
    for p in &caches {
      // 避免把已列入 originals 的路径再永久删一遍（极端情况下 path 被误记为 playback）
      if originals.iter().any(|o| o == p) {
        continue;
      }
      purge_cache_file(p);
    }

    if db::delete_media_by_path(&conn, path)? {
      deleted += 1;
    }
  }

  if deleted > 0 {
    if let Ok(guard) = state.lock() {
      guard.dirty.store(true, Ordering::SeqCst);
    }
  }
  Ok(deleted)
}

/// 扫描相册根全量媒体重复组（组内落库优先正本；不含删盘）
#[tauri::command]
pub fn album_find_local_duplicates(app: AppHandle) -> Result<Vec<DuplicateGroup>, String> {
  duplicates::find_local_duplicates(&app)
}

/// 重复清理弹窗：可见行 lazy 拉取缩略图（HEIC/视频等）
#[tauri::command]
pub fn album_resolve_duplicate_thumb(
  app: AppHandle,
  path: String,
) -> Result<Option<String>, String> {
  Ok(duplicates::resolve_display_thumb_on_demand(&app, &path))
}

/// 返回 WebView 可直接 `<video>` 播放的路径：H.264 等原生格式原样返回；HEVC 转 H.264 MP4 缓存
/// 同时 ffprobe 编码分辨率并写入 media.db（单独视频信息面板用）
#[tauri::command]
pub async fn album_ensure_playback(
  app: AppHandle,
  path: String,
) -> Result<types::AlbumPlaybackResult, String> {
  use std::path::PathBuf;
  use std::time::UNIX_EPOCH;

  let path = path.trim().to_string();
  if path.is_empty() {
    return Err("路径为空".into());
  }
  let src = PathBuf::from(&path);
  if !src.is_file() {
    return Err(format!("文件不存在: {path}"));
  }

  let ext = src
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();
  if !thumbnail::is_video_ext(&ext) {
    return Ok(types::AlbumPlaybackResult {
      path,
      width: None,
      height: None,
    });
  }

  let modified = std::fs::metadata(&src)
    .and_then(|m| m.modified())
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  let album_data_dir = album_dir(&app)?;
  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{}", types::ALBUM_CACHE_VERSION));
  std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建播放缓存目录失败: {e}"))?;

  let cache_file = thumbnail::playback_cache_file(&cache_dir, &path, modified);
  let ffprobe_bin = ffmpeg::resolve_ffprobe_binary(&app);
  // 一次 ffprobe：分辨率落库 + codec 决定是否转码（避免二次起进程）
  let (width, height, codec) =
    probe_and_persist_video_stream(&album_data_dir, &path, ffprobe_bin.as_deref());

  if cache_file.is_file()
    && std::fs::metadata(&cache_file)
      .map(|m| m.len() > 0)
      .unwrap_or(false)
  {
    let cache_ok = ffprobe_bin
      .as_ref()
      .map(|p| ffmpeg::is_web_playable_h264(p, &cache_file))
      .unwrap_or(true);
    if cache_ok {
      let cache_path = cache_file.to_string_lossy().into_owned();
      persist_playback_path(&album_data_dir, &path, &cache_path);
      return Ok(types::AlbumPlaybackResult {
        path: cache_path,
        width,
        height,
      });
    }
    let _ = std::fs::remove_file(&cache_file);
    log::warn!("album: 播放代理缓存无效，将重新转码: {}", cache_file.display());
  }

  let needs_transcode = if ffmpeg::prefer_playback_proxy(&ext) {
    true
  } else if let Some(ref c) = codec {
    ffmpeg::needs_playback_transcode(c)
  } else {
    false
  };

  if !needs_transcode {
    return Ok(types::AlbumPlaybackResult {
      path,
      width,
      height,
    });
  }

  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(&app).ok_or_else(|| {
    "未找到 ffmpeg，无法转码 HEVC 视频。开发环境请运行: pnpm run cs:ffmpeg-fetch".to_string()
  })?;

  let partial = cache_file.with_extension("mp4.partial");
  let src_for_task = src.clone();
  let cache_for_task = cache_file.clone();
  let partial_for_task = partial.clone();
  let path_for_err = path.clone();

  let ok = tokio::task::spawn_blocking(move || {
    if !ffmpeg::transcode_for_web_playback(&ffmpeg_bin, &src_for_task, &partial_for_task) {
      let _ = std::fs::remove_file(&partial_for_task);
      return false;
    }
    if !partial_for_task.is_file() {
      return false;
    }
    if cache_for_task.is_file() {
      let _ = std::fs::remove_file(&cache_for_task);
    }
    std::fs::rename(&partial_for_task, &cache_for_task).is_ok()
  })
  .await
  .map_err(|e| format!("转码任务失败: {e}"))?;

  if !ok {
    return Err(format!("HEVC 转码失败: {path_for_err}"));
  }
  if let Some(ref ffprobe) = ffprobe_bin {
    if !ffmpeg::is_web_playable_h264(ffprobe, &cache_file) {
      let _ = std::fs::remove_file(&cache_file);
      return Err(format!("转码结果无法播放: {path_for_err}"));
    }
  }
  let cache_path = cache_file.to_string_lossy().into_owned();
  persist_playback_path(&album_data_dir, &path, &cache_path);
  Ok(types::AlbumPlaybackResult {
    path: cache_path,
    width,
    height,
  })
}

/// 将树节点相对路径解析为相册根下的绝对目录；拒绝 `..` 与越界
fn resolve_album_subdir(root: &std::path::Path, rel: &str) -> Result<std::path::PathBuf, String> {
  let normalized = rel.trim().replace('\\', "/");
  let joined = if normalized.is_empty() || normalized == "." {
    root.to_path_buf()
  } else {
    let mut path = root.to_path_buf();
    for seg in normalized.split('/').filter(|s| !s.is_empty()) {
      if seg == ".." || seg == "." {
        return Err("非法相对路径".to_string());
      }
      path.push(seg);
    }
    path
  };

  let root_canon = root
    .canonicalize()
    .map_err(|e| format!("相册根目录无效: {e}"))?;
  let target_canon = joined
    .canonicalize()
    .map_err(|e| format!("目录不存在或无法访问: {e}"))?;
  if !target_canon.starts_with(&root_canon) {
    return Err("路径超出相册根目录".to_string());
  }
  if !target_canon.is_dir() {
    return Err("目标不是目录".to_string());
  }
  Ok(target_canon)
}

/**
 * 在系统资源管理器中打开相册子目录
 * @param rel_path 与前端树节点 key 一致（`.` 为根）
 * @note 走 Rust opener，避免前端 openPath 的 capability 路径 scope（相册根用户自选）
 */
#[tauri::command]
pub fn album_open_dir(app: AppHandle, rel_path: String) -> Result<(), String> {
  use tauri_plugin_opener::OpenerExt;

  let settings = settings::load_settings(&app)?;
  let root = settings.root_dir.trim();
  if root.is_empty() {
    return Err("相册根目录未设置".to_string());
  }
  let target = resolve_album_subdir(std::path::Path::new(root), &rel_path)?;
  app
    .opener()
    .open_path(target.to_string_lossy().as_ref(), None::<&str>)
    .map_err(|e| format!("打开目录失败: {e}"))
}
