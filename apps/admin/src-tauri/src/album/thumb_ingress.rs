//! 同步落盘后的相册 media 静默入库
//! 职责：iCloud/QQ 下载成功后 upsert media.db（origin / capture_at）；**不**入出图 pending、**不**启 worker
//! 适用：同步为旁路任务，底下宫格浏览不被「加载文件」进度打扰；用户点刷新 `album_scan` 再出图并挂列表
//! @note 下载即 upsert media（与 sync 表此后断层）；缩略图由下次 album_scan 的 pipeline 从缺图列表 seed

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use tauri::AppHandle;

use super::db;
use super::settings::{self, album_dir};
use super::thumbnail;
use super::types::SyncedMediaIngress;

/// 进程内共享待出图路径（仅 `album_scan` pipeline 写入/drain；同步入库不再写入）
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
 * 同步下载成功后：仅静默写入 media.db（origin 与初始拍摄时间）
 * @note 不入 shared pending、不启动缩略图 worker，避免同步中底下宫格出现「加载文件」进度
 * @note 出图与宫格刷新改由用户点「刷新」触发的 `album_scan` 完成
 * @note path 须落在当前相册 root 下；不擦已有 thumb_path
 */
pub fn enqueue_thumbs_from_sync(app: &AppHandle, items: Vec<SyncedMediaIngress>) {
  if items.is_empty() {
    return;
  }
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
}
