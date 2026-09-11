//! QQ 空间同步任务
//! 职责：catalog → 入队下载；全局单任务；进度事件 `qzone-sync://progress`

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use super::capture_time;
use super::client;
use super::db;
use super::file_enrich;
use super::naming;
use super::session;
use super::settings;
use super::types::{QzoneJobSnapshot, QzoneJobStatus};

struct JobRuntime {
  pause: AtomicBool,
  cancel: AtomicBool,
  snapshot: Mutex<QzoneJobSnapshot>,
  worker: Mutex<Option<thread::JoinHandle<()>>>,
}

fn runtime() -> &'static JobRuntime {
  static RT: OnceLock<JobRuntime> = OnceLock::new();
  RT.get_or_init(|| JobRuntime {
    pause: AtomicBool::new(false),
    cancel: AtomicBool::new(false),
    snapshot: Mutex::new(QzoneJobSnapshot::default()),
    worker: Mutex::new(None),
  })
}

fn set_snapshot(next: QzoneJobSnapshot, app: &AppHandle) {
  if let Ok(mut g) = runtime().snapshot.lock() {
    *g = next.clone();
  }
  let _ = app.emit("qzone-sync://progress", next);
}

pub fn current_snapshot() -> QzoneJobSnapshot {
  runtime()
    .snapshot
    .lock()
    .map(|g| g.clone())
    .unwrap_or_default()
}

fn busy() -> bool {
  let status = current_snapshot().status;
  matches!(
    status.as_str(),
    "cataloging" | "downloading" | "paused"
  )
}

/// 开始：catalog 本人相册 → 下载 cloud_only；`album_id` 有值时仅该相册
pub fn start_sync(app: AppHandle, album_id: Option<String>) -> Result<QzoneJobSnapshot, String> {
  if busy() {
    return Err("已有 QQ 空间同步任务进行中".into());
  }
  let session = session::load_session(&app)?
    .ok_or_else(|| "未登录 QQ 空间".to_string())?;
  let output = settings::resolve_output_dir(&app)?;
  std::fs::create_dir_all(&output).map_err(|e| format!("创建输出目录失败: {e}"))?;

  runtime().pause.store(false, Ordering::SeqCst);
  runtime().cancel.store(false, Ordering::SeqCst);

  let handle = thread::Builder::new()
    .name("qzone-sync-worker".into())
    .spawn(move || {
      run_pipeline(app, session, output, album_id);
    })
    .map_err(|e| format!("启动同步线程失败: {e}"))?;

  if let Ok(mut g) = runtime().worker.lock() {
    *g = Some(handle);
  }
  Ok(current_snapshot())
}

pub fn pause_job() -> Result<QzoneJobSnapshot, String> {
  if current_snapshot().status != QzoneJobStatus::Downloading.as_str() {
    return Err("当前无法暂停".into());
  }
  runtime().pause.store(true, Ordering::SeqCst);
  let mut snap = current_snapshot();
  snap.status = QzoneJobStatus::Paused.as_str().into();
  snap.phase = "paused".into();
  if let Ok(mut g) = runtime().snapshot.lock() {
    *g = snap.clone();
  }
  Ok(snap)
}

pub fn resume_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  if current_snapshot().status != QzoneJobStatus::Paused.as_str() {
    return Err("当前无可继续的任务".into());
  }
  runtime().pause.store(false, Ordering::SeqCst);
  let mut snap = current_snapshot();
  snap.status = QzoneJobStatus::Downloading.as_str().into();
  snap.phase = "downloading".into();
  set_snapshot(snap.clone(), &app);
  Ok(snap)
}

pub fn cancel_job(app: AppHandle) -> Result<QzoneJobSnapshot, String> {
  runtime().cancel.store(true, Ordering::SeqCst);
  runtime().pause.store(false, Ordering::SeqCst);
  let mut snap = current_snapshot();
  snap.status = QzoneJobStatus::Idle.as_str().into();
  snap.phase = "cancelled".into();
  snap.message = "已取消".into();
  set_snapshot(snap.clone(), &app);
  Ok(snap)
}

fn wait_if_paused(app: &AppHandle) -> bool {
  while runtime().pause.load(Ordering::SeqCst) {
    if runtime().cancel.load(Ordering::SeqCst) {
      return false;
    }
    thread::sleep(Duration::from_millis(200));
    let mut snap = current_snapshot();
    snap.status = QzoneJobStatus::Paused.as_str().into();
    set_snapshot(snap, app);
  }
  !runtime().cancel.load(Ordering::SeqCst)
}

fn run_pipeline(
  app: AppHandle,
  session: super::types::QzoneSession,
  output: PathBuf,
  album_filter: Option<String>,
) {
  let fail = |app: &AppHandle, msg: String| {
    set_snapshot(
      QzoneJobSnapshot {
        status: QzoneJobStatus::Failed.as_str().into(),
        phase: "failed".into(),
        message: msg,
        ..current_snapshot()
      },
      app,
    );
  };

  let scope_msg = album_filter
    .as_ref()
    .map(|id| format!("相册 {id}"))
    .unwrap_or_else(|| "全部相册".into());

  set_snapshot(
    QzoneJobSnapshot {
      status: QzoneJobStatus::Cataloging.as_str().into(),
      phase: "cataloging".into(),
      message: format!("正在拉取{scope_msg}…"),
      ..Default::default()
    },
    &app,
  );

  let mut albums = match client::list_albums(&session) {
    Ok(a) => a,
    Err(e) => {
      fail(&app, e);
      return;
    }
  };
  if let Some(ref id) = album_filter {
    albums.retain(|a| &a.topic_id == id);
    if albums.is_empty() {
      fail(&app, format!("未找到相册 {id}"));
      return;
    }
  }

  let conn = match db::open_app_db(&app) {
    Ok(c) => c,
    Err(e) => {
      fail(&app, e);
      return;
    }
  };

  let mut cataloged = 0u32;
  for (i, album) in albums.iter().enumerate() {
    if runtime().cancel.load(Ordering::SeqCst) {
      return;
    }
    set_snapshot(
      QzoneJobSnapshot {
        status: QzoneJobStatus::Cataloging.as_str().into(),
        phase: "cataloging".into(),
        done: i as u32,
        total: albums.len() as u32,
        message: format!("枚举相册：{}", album.name),
        ..Default::default()
      },
      &app,
    );
    let photos = match client::list_photos(&session, &album.topic_id) {
      Ok(p) => p,
      Err(e) => {
        log::warn!("qzone_sync: list photos {}: {e}", album.topic_id);
        continue;
      }
    };
    for photo in photos {
      if let Err(e) = db::upsert_asset(
        &conn,
        &photo.asset_id,
        &album.topic_id,
        &album.name,
        &photo.name,
        &photo.media_kind,
        photo.capture_at.as_deref(),
        &photo.download_url,
      ) {
        log::warn!("qzone_sync: upsert {}: {e}", photo.asset_id);
        continue;
      }
      cataloged += 1;
    }
  }

  let pending = match db::list_pending_downloads(&conn, album_filter.as_deref()) {
    Ok(p) => p,
    Err(e) => {
      fail(&app, e);
      return;
    }
  };

  let total = pending.len() as u32;
  set_snapshot(
    QzoneJobSnapshot {
      status: QzoneJobStatus::Downloading.as_str().into(),
      phase: "downloading".into(),
      done: 0,
      total,
      message: format!("catalog {cataloged}，待下载 {total}"),
      ..Default::default()
    },
    &app,
  );

  let mut updated = 0u32;
  let mut skipped = 0u32;
  let mut failed = 0u32;

  for (idx, (asset_id, album_id, album_name, original_filename, capture_at, url, media_kind)) in
    pending.into_iter().enumerate()
  {
    if !wait_if_paused(&app) {
      return;
    }
    // 视频：catalog 里常是封面/空 URL，下载前用 floatview 解析 MP4
    let fetch_url = if media_kind == "video" {
      match client::resolve_video_download_url(&session, &album_id, &asset_id) {
        Ok(u) => u,
        Err(e) => {
          log::warn!("qzone_sync: resolve video {asset_id}: {e}");
          failed += 1;
          set_snapshot(
            QzoneJobSnapshot {
              status: QzoneJobStatus::Downloading.as_str().into(),
              phase: "downloading".into(),
              done: (idx as u32) + 1,
              total,
              message: format!("视频解析失败 {asset_id}"),
              updated,
              skipped,
              failed,
            },
            &app,
          );
          continue;
        }
      }
    } else {
      url
    };
    let safe_album = sanitize_dir_name(&album_name);
    let ext = guess_ext(&fetch_url, &original_filename, &asset_id);
    let unix_secs = capture_time::unix_secs_from_stored(capture_at.as_deref());
    let filename = naming::build_filename(unix_secs, &session.uin, &asset_id, &ext);
    let dest = output.join(&session.uin).join(&safe_album).join(&filename);

    if dest.is_file() {
      if let Ok(meta) = std::fs::metadata(&dest) {
        if meta.len() > 0 {
          // 已存在：仍补 mtime/EXIF（对齐 QzonePhoto 跳过下载后仍 enrich）
          file_enrich::enrich_downloaded_file(&dest, unix_secs);
          let _ = db::mark_synced(&conn, &asset_id, &dest.to_string_lossy());
          skipped += 1;
          set_snapshot(
            QzoneJobSnapshot {
              status: QzoneJobStatus::Downloading.as_str().into(),
              phase: "downloading".into(),
              done: (idx as u32) + 1,
              total,
              message: format!("跳过已存在 {filename}"),
              updated,
              skipped,
              failed,
            },
            &app,
          );
          continue;
        }
      }
    }

    match client::download_file(&session, &fetch_url, &dest) {
      Ok(()) => {
        file_enrich::enrich_downloaded_file(&dest, unix_secs);
        let _ = db::mark_synced(&conn, &asset_id, &dest.to_string_lossy());
        updated += 1;
      }
      Err(e) => {
        log::warn!("qzone_sync: download {asset_id}: {e}");
        failed += 1;
        let _ = std::fs::remove_file(&dest);
      }
    }

    set_snapshot(
      QzoneJobSnapshot {
        status: QzoneJobStatus::Downloading.as_str().into(),
        phase: "downloading".into(),
        done: (idx as u32) + 1,
        total,
        message: format!("下载 {filename}"),
        updated,
        skipped,
        failed,
      },
      &app,
    );
  }

  if runtime().cancel.load(Ordering::SeqCst) {
    return;
  }

  set_snapshot(
    QzoneJobSnapshot {
      status: QzoneJobStatus::Done.as_str().into(),
      phase: "done".into(),
      done: total,
      total,
      message: format!("完成：新增 {updated}，跳过 {skipped}，失败 {failed}"),
      updated,
      skipped,
      failed,
    },
    &app,
  );
}

fn sanitize_dir_name(name: &str) -> String {
  let s: String = name
    .chars()
    .map(|c| match c {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
      _ => c,
    })
    .collect();
  let t = s.trim();
  if t.is_empty() {
    "album".into()
  } else {
    t.chars().take(80).collect()
  }
}

fn guess_ext(url: &str, original: &str, asset_id: &str) -> String {
  for candidate in [original, url, asset_id] {
    if let Some(ext) = std::path::Path::new(candidate)
      .extension()
      .and_then(|e| e.to_str())
    {
      let e = ext.to_ascii_lowercase();
      if matches!(
        e.as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "heic" | "mp4" | "mov" | "avi"
      ) {
        return if e == "jpeg" { "jpg".into() } else { e };
      }
    }
  }
  if url.contains("mp4") || url.contains("video") {
    "mp4".into()
  } else {
    "jpg".into()
  }
}
