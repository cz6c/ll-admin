//! 本地相册
//! 职责：扫描本地目录媒体文件、按子目录分组、识别实况照片；后台缩略图与增量索引
//! 适用：admin CS（Tauri）个人工具

mod db;
mod ffmpeg;
mod heic_decode;
mod preview;
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
pub fn album_save_settings(app: AppHandle, settings: AlbumSettings) -> Result<(), String> {
  settings::save_settings(&app, &settings)
}

/// 取消进行中的缩略图后台任务
#[tauri::command]
pub fn album_cancel_scan(state: State<'_, Mutex<AlbumState>>) -> Result<(), String> {
  state.lock().map_err(|e| format!("锁失败: {e}"))?.cancel.cancel();
  Ok(())
}

/// 扫描根目录：先返回文件列表，缩略图后台生成并通过事件推送
#[tauri::command]
pub async fn album_scan(
  app: AppHandle,
  state: State<'_, Mutex<AlbumState>>,
  root: String,
  thumb_size: u32,
) -> Result<Vec<MediaGroup>, String> {
  let album_data_dir = album_dir(&app)?;

  // 1. 取消旧 pipeline，并立刻 bump epoch 作废其写库/emit（超时残留也不再污染新扫描）
  //    等待上限对齐 ffmpeg 单次超时 + 余量，降低残留概率；仍残留时靠 epoch 挡副作用
  let (old_pipeline, pipeline_epoch, my_epoch) = {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.cancel.cancel();
    let my_epoch = guard.pipeline_epoch.fetch_add(1, Ordering::SeqCst) + 1;
    (
      guard.pipeline.take(),
      Arc::clone(&guard.pipeline_epoch),
      my_epoch,
    )
  };
  if let Some(handle) = old_pipeline {
    let wait = Duration::from_secs(ffmpeg::FFMPEG_TIMEOUT_SECS + 5);
    let _ = tokio::time::timeout(wait, handle).await;
  }

  let cancel = {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    let token = ScanCancelToken::default();
    guard.cancel = token.clone();
    token
  };

  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(&app);
  if let Some(path) = &ffmpeg_bin {
    log::info!("album: HEIC decode via ffmpeg ({})", path.display());
  } else {
    log::warn!(
      "album: ffmpeg 未找到，HEIC 将回退 WIC/sips；开发环境请运行: pnpm run cs:ffmpeg-fetch"
    );
  }

  // 2. 读取 dirty：false 走 DB 缓存秒返（跳过 WalkDir），true 走全量 discover 并清零
  let dirty_flag = {
    let guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    Arc::clone(&guard.dirty)
  };

  // 1.5 缓存版本迁移：删除旧版本目录 + 清空 DB thumb_path/preview_path/fail_count
  // 仅在有旧版本目录时执行一次；迁移后 dirty 必为 true，走全量 discover
  {
    let thumbs_dir = album_data_dir.join("thumbs");
    let current_ver = format!("v{}", types::ALBUM_CACHE_VERSION);
    let mut migrated = false;
    if let Ok(entries) = std::fs::read_dir(&thumbs_dir) {
      for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
          if name != current_ver {
            let _ = std::fs::remove_dir_all(entry.path());
            log::info!("album: removed old cache version dir: {}", name);
            migrated = true;
          }
        }
      }
    }
    if migrated {
      let album_dir_for_migrate = album_data_dir.clone();
      let _ = tokio::task::spawn_blocking(move || {
        let conn = db::open_db(&album_dir_for_migrate)?;
        db::clear_all_cache_paths(&conn)
      })
      .await;
      // 强制走全量 discover
      dirty_flag.store(true, Ordering::SeqCst);
      log::info!("album: cache version migrated, forcing full discover");
    }
  }

  let cache_hit = !dirty_flag.load(Ordering::SeqCst);

  let groups = if cache_hit {
    let root_for_cache = root.clone();
    let album_dir_for_cache = album_data_dir.clone();
    tokio::task::spawn_blocking(move || {
      let conn = db::open_db(&album_dir_for_cache)?;
      db::load_groups(&conn, &root_for_cache)
    })
    .await
    .map_err(|e| format!("缓存查询任务失败: {e}"))??
  } else {
    let app_discover = app.clone();
    let root_discover = root.clone();
    let album_dir_clone = album_data_dir.clone();
    let groups = tokio::task::spawn_blocking(move || {
      scanner::discover_groups(&app_discover, &root_discover, &album_dir_clone)
    })
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))??;
    // 全量重扫完成，清零 dirty；watcher 后续变动会再次置位
    dirty_flag.store(false, Ordering::SeqCst);
    groups
  };

  {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.watcher = start_watching(root.clone(), Arc::clone(&guard.dirty));
  }

  let app_bg = app.clone();
  let groups_bg = groups.clone();
  let handle = tokio::task::spawn_blocking(move || {
    scanner::run_thumbnail_pipeline(
      app_bg,
      root,
      album_data_dir,
      thumb_size,
      ffmpeg_bin,
      groups_bg,
      cancel,
      pipeline_epoch,
      my_epoch,
    );
  });
  {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.pipeline = Some(handle);
  }

  Ok(groups)
}

/// 懒加载 HEIC/HEIF 全尺寸预览缓存
#[tauri::command]
pub async fn album_ensure_preview(app: AppHandle, path: String) -> Result<Option<String>, String> {
  let album_data_dir = album_dir(&app)?;
  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{}", types::ALBUM_CACHE_VERSION));
  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(&app);

  let path_for_db = path.clone();
  let preview_path = tokio::task::spawn_blocking(move || {
    preview::ensure_heif_preview(&path, &cache_dir, ffmpeg_bin.as_deref())
  })
    .await
    .map_err(|e| format!("预览任务失败: {e}"))?;

  if let Some(preview) = &preview_path {
    if let Ok(conn) = db::open_db(&album_data_dir) {
      let _ = db::update_cache_paths(&conn, &path_for_db, None, Some(preview));
    }
  }

  Ok(preview_path)
}
