//! 相册缩略图入队（与 album_scan 共用 single-flight 管线）
//! 职责：同步落盘后把 path 写入共享 pending；已有 worker 则只追加，空闲才启动
//! 适用：icloud_sync / qzone_sync 下载成功；禁止每次入队 new pipeline 覆盖相册管线
//! @note 下载即 upsert media（origin 元数据 + 初始 capture_at），与 sync 表此后断层

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
use super::types::SyncedMediaIngress;
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
 * 同步下载成功后：写入 media.db（含 origin 字段与初始拍摄时间）并入队出图
 * @note 不 cancel 正在跑的相册管线；仅追加。空闲时才 bump epoch 开新 worker。
 * @note path 须落在当前相册 root 下；不擦已有 thumb_path。
 */
pub fn enqueue_thumbs_from_sync(app: &AppHandle, items: Vec<SyncedMediaIngress>) {
  if items.is_empty() {
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
  let root_path = Path::new(&root);

  let mut accepted: Vec<SyncedMediaIngress> = Vec::with_capacity(items.len());
  for item in items {
    let path = Path::new(&item.path);
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
    accepted.push(item);
  }
  if accepted.is_empty() {
    return;
  }

  if let Ok(conn) = db::open_db(&album_data_dir) {
    for item in &accepted {
      if let Err(e) = db::upsert_media_from_sync(&conn, &root, item) {
        log::warn!("album sync ingress: upsert media {}: {e}", item.path);
      }
    }
  }

  let paths: Vec<String> = accepted.into_iter().map(|i| i.path).collect();

  let pending = {
    let Ok(guard) = state.lock() else {
      return;
    };
    guard.thumb_pending.extend(paths);
    Arc::clone(&guard.thumb_pending)
  };

  ensure_thumb_worker(app, &state, pending, root, album_data_dir);
}

/// 若管线空闲则启动 drain worker；已在跑则只依赖 pending 追加
fn ensure_thumb_worker(
  app: &AppHandle,
  state: &tauri::State<'_, Mutex<AlbumState>>,
  thumb_pending: Arc<ThumbPending>,
  root: String,
  album_data_dir: PathBuf,
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
  // sync / qzone worker 在 std::thread 上，无当前 Tokio Handle；
  // 须经 Tauri 全局 runtime，不能 tokio::task::spawn_blocking（会 panic: no reactor）
  let handle = match tauri::async_runtime::handle().spawn_blocking(move || {
    scanner::run_thumbnail_pipeline(
      app_bg,
      root,
      album_data_dir,
      ffmpeg_bin,
      Vec::new(),
      cancel,
      pipeline_epoch,
      my_epoch,
      thumb_pending,
    );
  }) {
    tauri::async_runtime::JoinHandle::Tokio(h) => h,
  };
  if let Ok(mut guard) = state.lock() {
    guard.pipeline = Some(handle);
  }
}
