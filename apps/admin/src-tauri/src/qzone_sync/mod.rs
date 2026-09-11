//! QQ 空间照片同步（第二备份源）
//! 职责：扫码登录、catalog、下载落盘、设置；与 icloud_sync 平行
//! 适用：admin CS；仅本人相册原图/视频
//! 合规：自研网页端接口调用；不嵌入 GPL 第三方客户端源码

mod capture_time;
mod client;
mod db;
mod file_enrich;
mod job;
pub(crate) mod media_protocol;
mod naming;
mod qr_login;
mod session;
mod settings;
pub(crate) mod types;

use std::path::PathBuf;

use tauri::{AppHandle, State};

use types::{QzoneAuthState, QzoneJobSnapshot, QzoneSyncSettings};

/// 供 album 扫描识别本源落盘命名
pub(crate) use naming::is_sync_asset_filename;
/// 供 album meta 按 path 查 capture_at
pub(crate) use db::{lookup_capture_at, open_db, state_db_path};

/**
 * 当前同步落盘目录；未配置时 None
 */
pub(crate) fn resolve_sync_output_dir(app: &AppHandle) -> Option<PathBuf> {
  settings::resolve_output_dir(app).ok()
}

/// 进程内扫码会话
pub struct QzoneSyncState {
  pub qr: qr_login::QrLoginGate,
}

impl QzoneSyncState {
  pub fn new() -> Self {
    Self {
      qr: qr_login::QrLoginGate::new(),
    }
  }
}

#[tauri::command]
pub fn qzone_sync_get_settings(app: AppHandle) -> Result<QzoneSyncSettings, String> {
  settings::load_settings(&app)
}

#[tauri::command]
pub fn qzone_sync_save_settings(
  app: AppHandle,
  settings: QzoneSyncSettings,
) -> Result<QzoneSyncSettings, String> {
  settings::save_settings(&app, &settings)?;
  settings::load_settings(&app)
}

#[tauri::command]
pub fn qzone_sync_default_output_dir(app: AppHandle) -> Result<Option<String>, String> {
  Ok(
    settings::resolve_default_output_dir(&app)?
      .map(|p| p.to_string_lossy().to_string()),
  )
}

#[tauri::command]
pub fn qzone_sync_auth_state(app: AppHandle) -> Result<QzoneAuthState, String> {
  let session = session::load_session(&app)?;
  Ok(QzoneAuthState {
    logged_in: session.is_some(),
    uin: session.map(|s| s.uin),
  })
}

/// 开始扫码登录：返回二维码 data URL
#[tauri::command]
pub fn qzone_sync_qr_start(
  state: State<'_, QzoneSyncState>,
) -> Result<qr_login::QzoneQrStartResult, String> {
  qr_login::start_qr(&state.qr)
}

/// 轮询扫码；成功则落会话
#[tauri::command]
pub fn qzone_sync_qr_poll(
  app: AppHandle,
  state: State<'_, QzoneSyncState>,
) -> Result<qr_login::QzoneQrPollResult, String> {
  qr_login::poll_qr(&app, &state.qr)
}

#[tauri::command]
pub fn qzone_sync_logout(app: AppHandle) -> Result<(), String> {
  let _ = job::cancel_job(app.clone());
  session::clear_session(&app)
}

/// 同步到本地：catalog + 下载；`album_id` 为空则全部相册
#[tauri::command]
pub fn qzone_sync_start_job(
  app: AppHandle,
  album_id: Option<String>,
) -> Result<QzoneJobSnapshot, String> {
  job::start_sync(app, album_id)
}

#[tauri::command]
pub fn qzone_sync_pause_job() -> Result<QzoneJobSnapshot, String> {
  job::pause_job()
}

#[tauri::command]
pub fn qzone_sync_resume_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  job::resume_job(app)
}

#[tauri::command]
pub fn qzone_sync_cancel_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  job::cancel_job(app)
}

#[tauri::command]
pub fn qzone_sync_job_status() -> Result<QzoneJobSnapshot, String> {
  Ok(job::current_snapshot())
}

/// 云端相册摘要（需已登录；不入队下载）
#[tauri::command]
pub fn qzone_sync_list_albums(app: AppHandle) -> Result<Vec<types::QzoneAlbumSummary>, String> {
  let sess = session::load_session(&app)?.ok_or_else(|| "未登录 QQ 空间".to_string())?;
  client::list_albums(&sess)
}

/// 某相册相片浏览列表（缩略/预览 URL）
#[tauri::command]
pub fn qzone_sync_list_photos(
  app: AppHandle,
  album_id: String,
) -> Result<Vec<types::QzonePhotoView>, String> {
  let sess = session::load_session(&app)?.ok_or_else(|| "未登录 QQ 空间".to_string())?;
  if album_id.trim().is_empty() {
    return Err("album_id 不能为空".into());
  }
  client::list_photo_views(&sess, &album_id)
}

/// 带 Cookie 代理拉取媒体（缩略图 / 灯箱）
/// `max_bytes`：可选体积上限（缩略图建议 1.5MB）
#[tauri::command]
pub fn qzone_sync_fetch_media(
  app: AppHandle,
  url: String,
  max_bytes: Option<u32>,
) -> Result<types::QzoneMediaBlob, String> {
  let sess = session::load_session(&app)?.ok_or_else(|| "未登录 QQ 空间".to_string())?;
  if url.trim().is_empty() {
    return Err("url 不能为空".into());
  }
  client::fetch_media_blob(&sess, &url, max_bytes.map(|n| n as usize))
}

/// 视频/大文件预览：落盘到 media-cache，返回本地绝对路径（前端 convertFileSrc）
/// 视频优先用 albumId+assetId 调 floatview 取 MP4，再落盘
#[tauri::command]
pub fn qzone_sync_prepare_preview(
  app: AppHandle,
  url: String,
  album_id: Option<String>,
  asset_id: Option<String>,
  media_kind: Option<String>,
) -> Result<String, String> {
  let sess = session::load_session(&app)?.ok_or_else(|| "未登录 QQ 空间".to_string())?;
  let kind = media_kind.as_deref().unwrap_or("");
  let mut fetch_url = url.trim().to_string();
  if kind == "video" {
    let aid = album_id.as_deref().unwrap_or("").trim();
    let pid = asset_id.as_deref().unwrap_or("").trim();
    if !aid.is_empty() && !pid.is_empty() {
      fetch_url = client::resolve_video_download_url(&sess, aid, pid)?;
    } else if fetch_url.is_empty() || client::is_hls_url(&fetch_url) {
      return Err("视频预览需要 albumId/assetId，或非 m3u8 的直链".into());
    }
  }
  if fetch_url.is_empty() {
    return Err("url 不能为空".into());
  }
  let dir = settings::qzone_sync_dir(&app)?.join("media-cache");
  // 预览上限 80MB；更大请下载到相册后本地打开
  let path = client::cache_media_to_file(&sess, &fetch_url, &dir, 80 * 1024 * 1024)?;
  Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn qzone_sync_pending_count(app: AppHandle) -> Result<u32, String> {
  let path = state_db_path(&app)?;
  if !path.is_file() {
    return Ok(0);
  }
  let conn = open_db(&path)?;
  db::count_by_state(&conn, "cloud_only")
}

/// 供 album duplicates：已同步本地行
pub fn list_synced_local_rows(
  app: &AppHandle,
) -> Result<Vec<(String, String, String)>, String> {
  let path = state_db_path(app)?;
  if !path.is_file() {
    return Ok(Vec::new());
  }
  let conn = open_db(&path)?;
  db::list_synced_dest_paths(&conn)
}
