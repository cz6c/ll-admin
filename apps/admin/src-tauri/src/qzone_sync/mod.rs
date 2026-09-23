//! QQ 空间照片同步（第二备份源）
//! 职责：扫码登录、catalog、下载落盘；与 icloud_sync 平行
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
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use types::{QzoneAuthState, QzoneJobSnapshot};

/// 供 album 扫描识别本源落盘命名
pub(crate) use naming::is_sync_asset_filename;
use db::{open_app_db, open_db, state_db_path};

/**
 * 本地改名后同步 `assets.dest_path`（best-effort）
 */
pub fn remap_dest_paths(app: &AppHandle, renames: &[(String, String)]) {
  if renames.is_empty() {
    return;
  }
  let Ok(path) = state_db_path(app) else {
    return;
  };
  if !path.is_file() {
    return;
  }
  let Ok(conn) = open_db(&path) else {
    return;
  };
  crate::sync_common::remap_assets_dest_paths(&conn, renames, "qzone_sync");
}

/**
 * 授权失效时清 session、取消任务，并通知前端回到扫码态
 * @returns 原错误串（便于 invoke / toast）
 */
pub(crate) fn on_auth_expired(app: &AppHandle, err: String) -> String {
  if !client::is_auth_expired_error(&err) {
    return err;
  }
  let _ = session::clear_session(app);
  let _ = job::cancel_job(app.clone());
  let _ = app.emit("qzone-sync://auth-expired", ());
  err
}

/**
 * 执行需登录的 QQ 接口；授权失败则清登录态
 */
fn with_qzone_session<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
  F: FnOnce(&types::QzoneSession) -> Result<T, String>,
{
  let sess = session::load_session(app)?.ok_or_else(|| "未登录 QQ 空间".to_string())?;
  f(&sess).map_err(|e| on_auth_expired(app, e))
}

/**
 * 同步落盘目录写死：`{albumRoot}/QzoneSync`；未配相册根时 None
 */
pub(crate) fn resolve_sync_output_dir(app: &AppHandle) -> Option<PathBuf> {
  settings::resolve_output_dir(app).ok().flatten()
}

/// 进程内扫码会话
/// @note `qr` 用 `Arc` 包，便于在 spawn_blocking 闭包内克隆持有（参考 icloud_sync SidecarClientHandle）
pub struct QzoneSyncState {
  pub qr: Arc<qr_login::QrLoginGate>,
}

impl QzoneSyncState {
  pub fn new() -> Self {
    Self {
      qr: Arc::new(qr_login::QrLoginGate::new()),
    }
  }
}

#[tauri::command]
pub async fn qzone_sync_auth_state(app: AppHandle) -> Result<QzoneAuthState, String> {
  tokio::task::spawn_blocking(move || {
    let Some(session) = session::load_session(&app)? else {
      return Ok(QzoneAuthState {
        logged_in: false,
        uin: None,
      });
    };
    // 有本地会话时主动探测；仅鉴权失效才清盘，网络错误保留 logged_in
    match client::probe_session(&session) {
      Ok(()) => Ok(QzoneAuthState {
        logged_in: true,
        uin: Some(session.uin),
      }),
      Err(e) if client::is_auth_expired_error(&e) => {
        let _ = on_auth_expired(&app, e);
        Ok(QzoneAuthState {
          logged_in: false,
          uin: None,
        })
      }
      Err(e) => {
        log::warn!("qzone_sync: auth_state probe soft-fail: {e}");
        Ok(QzoneAuthState {
          logged_in: true,
          uin: Some(session.uin),
        })
      }
    }
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/// 开始扫码登录：返回二维码 data URL
#[tauri::command]
pub async fn qzone_sync_qr_start(
  state: State<'_, QzoneSyncState>,
) -> Result<qr_login::QzoneQrStartResult, String> {
  // State<'_> 非 'static，无法 move 进 spawn_blocking；克隆 Arc 后在线程内持有
  let qr = state.qr.clone();
  tokio::task::spawn_blocking(move || qr_login::start_qr(&qr))
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 轮询扫码；成功则落会话
#[tauri::command]
pub async fn qzone_sync_qr_poll(
  app: AppHandle,
  state: State<'_, QzoneSyncState>,
) -> Result<qr_login::QzoneQrPollResult, String> {
  let qr = state.qr.clone();
  tokio::task::spawn_blocking(move || qr_login::poll_qr(&app, &qr))
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
pub async fn qzone_sync_logout(app: AppHandle) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    let _ = job::cancel_job(app.clone());
    session::clear_session(&app)
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/// 同步到本地：catalog + 下载；`album_id` 为空则全部相册
#[tauri::command]
pub async fn qzone_sync_start_job(
  app: AppHandle,
  album_id: Option<String>,
) -> Result<QzoneJobSnapshot, String> {
  tokio::task::spawn_blocking(move || job::start_sync(app, album_id))
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
pub async fn qzone_sync_pause_job() -> Result<QzoneJobSnapshot, String> {
  job::pause_job()
}

#[tauri::command]
pub async fn qzone_sync_resume_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  job::resume_job(app)
}

#[tauri::command]
pub async fn qzone_sync_cancel_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  job::cancel_job(app)
}

#[tauri::command]
pub async fn qzone_sync_job_status() -> Result<QzoneJobSnapshot, String> {
  Ok(job::current_snapshot())
}

/// 云端相册摘要（需已登录；不入队下载）
#[tauri::command]
pub async fn qzone_sync_list_albums(app: AppHandle) -> Result<Vec<types::QzoneAlbumSummary>, String> {
  tokio::task::spawn_blocking(move || with_qzone_session(&app, |sess| client::list_albums(sess)))
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 某相册相片浏览列表（缩略/预览 URL）
#[tauri::command]
pub async fn qzone_sync_list_photos(
  app: AppHandle,
  album_id: String,
) -> Result<Vec<types::QzonePhotoView>, String> {
  if album_id.trim().is_empty() {
    return Err("album_id 不能为空".into());
  }
  tokio::task::spawn_blocking(move || {
    with_qzone_session(&app, |sess| {
      let mut views = client::list_photo_views(sess, &album_id)?;
      if let Ok(conn) = open_app_db(&app) {
        // 角标前先对账：库里 synced 但盘上没文件 → 回写未下载，避免虚标
        let _ = db::reconcile_synced_missing_local_files(&conn, Some(&album_id));
        if let Ok(synced) = db::synced_asset_ids(&conn, Some(&album_id)) {
          for v in &mut views {
            v.downloaded = synced.contains(&v.asset_id);
          }
        }
      }
      Ok(views)
    })
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/**
 * 从 QQ 空间移除所选照片（只删云端；本机文件与 media.db 保留）
 * @note 成功后硬删 sync assets 行，与「同步表只反映云端」一致
 */
#[tauri::command]
pub async fn qzone_sync_delete_photos(
  app: AppHandle,
  items: Vec<types::QzoneDeletePhotoItem>,
) -> Result<types::QzoneDeletePhotosResult, String> {
  if items.is_empty() {
    return Ok(types::QzoneDeletePhotosResult {
      deleted: 0,
      failed: 0,
      message: "未选择照片".into(),
    });
  }
  tokio::task::spawn_blocking(move || {
    // 按相册分组
    use std::collections::HashMap;
    let mut by_album: HashMap<(String, i32), Vec<(String, String)>> = HashMap::new();
    for it in &items {
      let album = it.album_id.trim();
      let aid = it.asset_id.trim();
      if album.is_empty() || aid.is_empty() {
        continue;
      }
      let sloc = if it.sloc.trim().is_empty() {
        aid.to_string()
      } else {
        it.sloc.trim().to_string()
      };
      by_album
        .entry((album.to_string(), it.album_priv))
        .or_default()
        .push((aid.to_string(), sloc));
    }
    if by_album.is_empty() {
      return Ok(types::QzoneDeletePhotosResult {
        deleted: 0,
        failed: items.len() as u32,
        message: "无效的删除项".into(),
      });
    }

    let mut deleted = 0u32;
    let mut failed = 0u32;
    let mut last_err = String::new();
    let mut ok_ids: Vec<String> = Vec::new();

    with_qzone_session(&app, |sess| {
      for ((album_id, priv_code), pairs) in &by_album {
        match client::delete_photos(sess, album_id, *priv_code, pairs) {
          Ok((d, f, ids, err)) => {
            deleted += d;
            failed += f;
            ok_ids.extend(ids);
            if !err.is_empty() {
              last_err = err;
            }
          }
          Err(e) => {
            // 鉴权失效等硬错误：整批中止
            return Err(e);
          }
        }
      }
      Ok(())
    })?;

    if !ok_ids.is_empty() {
      if let Ok(conn) = open_app_db(&app) {
        let _ = db::delete_assets_by_ids(&conn, &ok_ids);
      }
    }

    let message = if failed == 0 {
      format!("已从 QQ 空间移除 {deleted} 项（本机文件保留）")
    } else if deleted == 0 {
      format!("移除失败：{last_err}")
    } else {
      format!("已移除 {deleted} 项，失败 {failed} 项：{last_err}")
    };
    Ok(types::QzoneDeletePhotosResult {
      deleted,
      failed,
      message,
    })
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/**
 * 本机选中的文件上传到指定 QQ 相册（当前仅图片；视频计入 failed）
 * @note 与下载任务互斥：下载进行中禁止上传
 */
#[tauri::command]
pub async fn qzone_sync_upload_photos(
  app: AppHandle,
  album_id: String,
  paths: Vec<String>,
) -> Result<types::QzoneUploadPhotosResult, String> {
  let album_id = album_id.trim().to_string();
  if album_id.is_empty() {
    return Err("album_id 不能为空".into());
  }
  if paths.is_empty() {
    return Ok(types::QzoneUploadPhotosResult {
      uploaded: 0,
      failed: 0,
      message: "未选择文件".into(),
    });
  }
  if paths.len() > 50 {
    return Err("单次最多上传 50 个文件".into());
  }
  if job::current_snapshot().status == "cataloging"
    || job::current_snapshot().status == "downloading"
    || job::current_snapshot().status == "paused"
  {
    return Err("下载任务进行中，请稍后再上传".into());
  }

  tokio::task::spawn_blocking(move || {
    with_qzone_session(&app, |sess| {
      let mut uploaded = 0u32;
      let mut failed = 0u32;
      let mut last_err = String::new();
      for p in &paths {
        let path = std::path::Path::new(p);
        match client::upload_image_to_album(sess, &album_id, path) {
          Ok(()) => uploaded += 1,
          Err(e) => {
            if client::is_auth_expired_error(&e) {
              return Err(on_auth_expired(&app, e));
            }
            failed += 1;
            last_err = e;
            log::warn!("qzone_sync: upload {}: {last_err}", path.display());
          }
        }
      }
      let message = if failed == 0 {
        format!("已上传 {uploaded} 张到相册")
      } else if uploaded == 0 {
        format!("上传失败：{last_err}")
      } else {
        format!("已上传 {uploaded} 张，失败 {failed}：{last_err}")
      };
      Ok(types::QzoneUploadPhotosResult {
        uploaded,
        failed,
        message,
      })
    })
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/// 带 Cookie 代理拉取媒体（缩略图 / 灯箱）
/// `max_bytes`：可选体积上限（缩略图建议 1.5MB）
#[tauri::command]
pub async fn qzone_sync_fetch_media(
  app: AppHandle,
  url: String,
  max_bytes: Option<u32>,
) -> Result<types::QzoneMediaBlob, String> {
  if url.trim().is_empty() {
    return Err("url 不能为空".into());
  }
  tokio::task::spawn_blocking(move || {
    with_qzone_session(&app, |sess| {
      client::fetch_media_blob(sess, &url, max_bytes.map(|n| n as usize))
    })
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

/// 视频/大文件预览：落盘到 media-cache，返回本地绝对路径（前端 convertFileSrc）
/// 视频优先用 albumId+assetId 调 floatview 取 MP4，再落盘
#[tauri::command]
pub async fn qzone_sync_prepare_preview(
  app: AppHandle,
  url: String,
  album_id: Option<String>,
  asset_id: Option<String>,
  media_kind: Option<String>,
) -> Result<String, String> {
  tokio::task::spawn_blocking(move || {
    with_qzone_session(&app, |sess| {
      let kind = media_kind.as_deref().unwrap_or("");
      let mut fetch_url = url.trim().to_string();
      if kind == "video" {
        let aid = album_id.as_deref().unwrap_or("").trim();
        let pid = asset_id.as_deref().unwrap_or("").trim();
        if !aid.is_empty() && !pid.is_empty() {
          fetch_url = client::resolve_video_download_url(sess, aid, pid)?;
        } else if fetch_url.is_empty() || client::is_hls_url(&fetch_url) {
          return Err("视频预览需要 albumId/assetId，或非 m3u8 的直链".into());
        }
      }
      if fetch_url.is_empty() {
        return Err("url 不能为空".into());
      }
      let dir = settings::qzone_sync_dir(&app)?.join("media-cache");
      // 预览上限 80MB；更大请下载到相册后本地打开
      let path = client::cache_media_to_file(sess, &fetch_url, &dir, 80 * 1024 * 1024)?;
      Ok(path.to_string_lossy().to_string())
    })
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
pub async fn qzone_sync_pending_count(app: AppHandle) -> Result<u32, String> {
  tokio::task::spawn_blocking(move || {
    let path = state_db_path(&app)?;
    if !path.is_file() {
      return Ok(0);
    }
    let conn = open_db(&path)?;
    db::count_by_state(&conn, "cloud_only")
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}
