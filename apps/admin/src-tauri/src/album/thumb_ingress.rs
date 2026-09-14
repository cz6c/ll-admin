//! 相册缩略图入队（与 album_scan 共用 single-flight 管线）
//! 职责：同步落盘后把 path 写入共享 pending；已有 worker 则只追加，空闲才启动
//! 适用：icloud_sync / qzone_sync 下载成功；禁止每次入队 new pipeline 覆盖相册管线

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Manager};

use super::db;
use super::ffmpeg;
use super::scan_state::ScanCancelToken;
use super::scanner;
use super::settings::{self, album_dir};
use super::thumbnail;
use super::AlbumState;

/// 进程内共享待出图路径（scan 与同步共同写入）
#[derive(Default)]
pub struct ThumbPending {
  inner: Mutex<HashSet<String>>,
}

impl ThumbPending {
  pub fn new() -> Self {
    Self::default()
  }

  /// 追加待出图路径（已存在则忽略）
  pub fn extend<I>(&self, paths: I)
  where
    I: IntoIterator<Item = String>,
  {
    if let Ok(mut g) = self.inner.lock() {
      g.extend(paths);
    }
  }

  /// 取出当前全部 pending（调用方负责生成）
  pub fn take_all(&self) -> Vec<String> {
    match self.inner.lock() {
      Ok(mut g) => g.drain().collect(),
      Err(_) => Vec::new(),
    }
  }
}

fn is_album_image_ext(ext: &str) -> bool {
  matches!(
    ext,
    "jpg"
      | "jpeg"
      | "png"
      | "gif"
      | "webp"
      | "bmp"
      | "heic"
      | "heif"
      | "tiff"
      | "tif"
      | "svg"
      | "avif"
  )
}

/**
 * 同步下载成功后入队出图（不堵下载：只写 pending + 必要时拉起 worker）
 * @note 不 cancel 正在跑的相册管线；仅追加。空闲时才 bump epoch 开新 worker。
 * @note path 须落在当前相册 root 下；ensure media 行且不擦已有 thumb_path。
 */
pub fn enqueue_thumbs_from_sync(app: &AppHandle, paths: Vec<String>) {
  if paths.is_empty() {
    return;
  }
  let Some(state) = app.try_state::<Mutex<AlbumState>>() else {
    return;
  };
  let Ok(settings) = settings::load_settings(app) else {
    return;
  };
  let root = settings.root_dir.trim().to_string();
  if root.is_empty() {
    return;
  }
  let Ok(album_data_dir) = album_dir(app) else {
    return;
  };
  let thumb_size = settings.thumb_size;
  let root_path = Path::new(&root);

  let mut accepted: Vec<String> = Vec::with_capacity(paths.len());
  for raw in paths {
    let path = Path::new(&raw);
    if !path.is_file() || !path.starts_with(root_path) {
      continue;
    }
    let ext = path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.to_lowercase())
      .unwrap_or_default();
    if !is_album_image_ext(&ext) && !thumbnail::is_video_ext(&ext) {
      continue;
    }
    accepted.push(raw);
  }
  if accepted.is_empty() {
    return;
  }

  if let Ok(conn) = db::open_db(&album_data_dir) {
    for p in &accepted {
      if let Err(e) = db::ensure_media_row(&conn, &root, p) {
        log::warn!("album thumb ingress: ensure media row {p}: {e}");
      }
    }
  }

  let pending = {
    let Ok(guard) = state.lock() else {
      return;
    };
    guard.thumb_pending.extend(accepted);
    Arc::clone(&guard.thumb_pending)
  };

  ensure_thumb_worker(
    app,
    &state,
    pending,
    root,
    album_data_dir,
    thumb_size,
  );
}

/// 若管线空闲则启动 drain worker；已在跑则只依赖 pending 追加
fn ensure_thumb_worker(
  app: &AppHandle,
  state: &tauri::State<'_, Mutex<AlbumState>>,
  thumb_pending: Arc<ThumbPending>,
  root: String,
  album_data_dir: PathBuf,
  thumb_size: u32,
) {
  let (pipeline_epoch, my_epoch, cancel) = {
    let Ok(mut guard) = state.lock() else {
      return;
    };
    if let Some(h) = &guard.pipeline {
      if !h.is_finished() {
        return;
      }
    }
    let my_epoch = guard.pipeline_epoch.fetch_add(1, Ordering::SeqCst) + 1;
    let token = ScanCancelToken::default();
    guard.cancel = token.clone();
    (Arc::clone(&guard.pipeline_epoch), my_epoch, token)
  };

  let app_bg = app.clone();
  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(app);
  let handle = tokio::task::spawn_blocking(move || {
    scanner::run_thumbnail_pipeline(
      app_bg,
      root,
      album_data_dir,
      thumb_size,
      ffmpeg_bin,
      Vec::new(),
      cancel,
      pipeline_epoch,
      my_epoch,
      thumb_pending,
    );
  });
  if let Ok(mut guard) = state.lock() {
    guard.pipeline = Some(handle);
  }
}
