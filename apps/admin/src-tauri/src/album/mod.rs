//! 本地相册
//! 职责：扫描本地目录媒体文件、按子目录分组、识别实况照片；后台缩略图与增量索引
//! 适用：admin CS（Tauri）个人工具

mod db;
mod ffmpeg;
mod heic_decode;
mod scan_state;
mod scanner;
mod settings;
mod thumbnail;
mod types;
mod watcher;

pub use types::{AlbumSettings, MediaGroup};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use scan_state::ScanCancelToken;
use settings::album_dir;
use tauri::{AppHandle, State};
use watcher::start_watching;

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

  // 缓存版本迁移：删旧 thumbs/v* + 清空 DB 缓存路径；仅有旧目录时执行一次
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

/// 删除本地媒体文件及 media.db 索引（不触碰 iCloud sync assets）
/// @param paths 主文件绝对路径；Live Photo 会一并删除 video_path
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
    let (thumb, preview, video) = db::get_media_companion_paths(&conn, path)?;
    let mut to_remove: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(path)];
    if let Some(v) = video.filter(|s| !s.is_empty() && s != path) {
      to_remove.push(std::path::PathBuf::from(v));
    }
    for p in [thumb, preview].into_iter().flatten() {
      if !p.is_empty() {
        to_remove.push(std::path::PathBuf::from(p));
      }
    }
    for p in &to_remove {
      if p.is_file() {
        std::fs::remove_file(p).map_err(|e| format!("删除文件失败 {}: {e}", p.display()))?;
      }
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
