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

use std::sync::Mutex;

use scan_state::ScanCancelToken;
use settings::album_dir;
use tauri::{AppHandle, State};
use watcher::start_watching;

/// 相册运行时状态：扫描取消令牌、文件监听器
pub struct AlbumState {
  cancel: ScanCancelToken,
  watcher: Option<notify::RecommendedWatcher>,
}

impl AlbumState {
  pub fn new() -> Self {
    Self {
      cancel: ScanCancelToken::default(),
      watcher: None,
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
  let cancel = {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.cancel.cancel();
    guard.cancel.reset();
    guard.cancel.clone()
  };

  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(&app);
  if let Some(path) = &ffmpeg_bin {
    log::info!("album: HEIC decode via ffmpeg ({})", path.display());
  } else {
    log::warn!(
      "album: ffmpeg 未找到，HEIC 将回退 WIC/sips；开发环境请运行: pnpm run cs:ffmpeg-fetch"
    );
  }

  let app_discover = app.clone();
  let root_discover = root.clone();
  let album_dir_clone = album_data_dir.clone();

  let groups = tokio::task::spawn_blocking(move || {
    scanner::discover_groups(&app_discover, &root_discover, &album_dir_clone)
  })
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))??;

  {
    let mut guard = state.lock().map_err(|e| format!("锁失败: {e}"))?;
    guard.watcher = start_watching(app.clone(), root.clone());
  }

  let app_bg = app.clone();
  let groups_bg = groups.clone();
  tokio::task::spawn_blocking(move || {
    scanner::run_thumbnail_pipeline(
      app_bg,
      root,
      album_data_dir,
      thumb_size,
      ffmpeg_bin,
      groups_bg,
      cancel,
    );
  });

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
