//! QQ 空间媒体自定义协议 `qzoneimg`
//! 职责：WebView 原生加载缩略图/预览（Cookie + 磁盘缓存 + 全局限流）
//! 适用：`http://qzoneimg.localhost/?u=<urlencoded>&k=thumb|preview`
//!
//! 为何限流：WebView 会对列表一次性发起数十请求；无门闸时全部挂起排队，单张小图也会卡十几秒。

use std::fs;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

use tauri::http::{header, Request, StatusCode};
use tauri::{AppHandle, UriSchemeContext, UriSchemeResponder, Wry};

use super::client;
use super::session;
use super::settings::qzone_sync_dir;

/// 同时拉取远端上限（过小浪费带宽，过大又回到「全挂起」）
const MAX_INFLIGHT: u32 = 4;
/// 缩略图体积上限
const THUMB_MAX: usize = 2 * 1024 * 1024;
/// 预览体积上限
const PREVIEW_MAX: usize = 8 * 1024 * 1024;

struct FetchGate {
  inflight: Mutex<u32>,
  cv: Condvar,
}

fn fetch_gate() -> &'static FetchGate {
  static GATE: OnceLock<FetchGate> = OnceLock::new();
  GATE.get_or_init(|| FetchGate {
    inflight: Mutex::new(0),
    cv: Condvar::new(),
  })
}

fn acquire_fetch_slot() {
  let g = fetch_gate();
  let mut n = g.inflight.lock().unwrap_or_else(|e| e.into_inner());
  loop {
    if *n < MAX_INFLIGHT {
      *n += 1;
      return;
    }
    let (guard, _) = g
      .cv
      .wait_timeout(n, Duration::from_secs(60))
      .unwrap_or_else(|e| e.into_inner());
    n = guard;
  }
}

fn release_fetch_slot() {
  let g = fetch_gate();
  if let Ok(mut n) = g.inflight.lock() {
    if *n > 0 {
      *n -= 1;
    }
    g.cv.notify_one();
  }
}

/**
 * 异步协议入口（由 lib.rs 注册为 `qzoneimg`）
 * 后台线程拉媒体，不堵 WebView 主线程
 */
pub fn handle_request(
  ctx: UriSchemeContext<'_, Wry>,
  request: Request<Vec<u8>>,
  responder: UriSchemeResponder,
) {
  let app = ctx.app_handle().clone();
  std::thread::spawn(move || {
    let response = match serve_media(&app, request.uri()) {
      Ok((ctype, bytes)) => tauri::http::Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::CACHE_CONTROL, "private, max-age=604800")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR)),
      Err(code) => empty_response(code),
    };
    responder.respond(response);
  });
}

fn empty_response(status: StatusCode) -> tauri::http::Response<Vec<u8>> {
  tauri::http::Response::builder()
    .status(status)
    .header(header::CONTENT_TYPE, "text/plain")
    .body(Vec::new())
    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

fn serve_media(
  app: &AppHandle,
  uri: &tauri::http::Uri,
) -> Result<(String, Vec<u8>), StatusCode> {
  let (remote, kind) = extract_params(uri).ok_or(StatusCode::BAD_REQUEST)?;
  let max_bytes = if kind == "preview" {
    PREVIEW_MAX
  } else {
    THUMB_MAX
  };

  // 磁盘缓存命中：不占远端并发槽
  if let Some(hit) = read_cache(app, &remote) {
    return Ok(hit);
  }

  let sess = session::load_session(app)
    .map_err(|_| StatusCode::UNAUTHORIZED)?
    .ok_or(StatusCode::UNAUTHORIZED)?;

  acquire_fetch_slot();
  let fetched = client::fetch_media_bytes(&sess, &remote, Some(max_bytes));
  release_fetch_slot();

  let (ctype, bytes) = fetched.map_err(|_| StatusCode::BAD_GATEWAY)?;
  write_cache(app, &remote, &ctype, &bytes);
  Ok((ctype, bytes))
}

fn cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  let dir = qzone_sync_dir(app)?.join("media-cache");
  fs::create_dir_all(&dir).map_err(|e| format!("创建媒体缓存目录失败: {e}"))?;
  Ok(dir)
}

fn cache_key(url: &str) -> String {
  blake3::hash(url.as_bytes()).to_hex().to_string()
}

fn read_cache(app: &AppHandle, url: &str) -> Option<(String, Vec<u8>)> {
  let dir = cache_dir(app).ok()?;
  let key = cache_key(url);
  let bin = dir.join(format!("{key}.bin"));
  let meta = dir.join(format!("{key}.ctype"));
  if !bin.is_file() || !meta.is_file() {
    return None;
  }
  let ctype = fs::read_to_string(&meta).ok()?.trim().to_string();
  let bytes = fs::read(&bin).ok()?;
  if ctype.is_empty() || bytes.is_empty() {
    return None;
  }
  Some((ctype, bytes))
}

fn write_cache(app: &AppHandle, url: &str, ctype: &str, bytes: &[u8]) {
  let Ok(dir) = cache_dir(app) else {
    return;
  };
  let key = cache_key(url);
  let _ = fs::write(dir.join(format!("{key}.ctype")), ctype);
  let _ = fs::write(dir.join(format!("{key}.bin")), bytes);
}

/// `u` = 远端 URL；`k` = thumb|preview
fn extract_params(uri: &tauri::http::Uri) -> Option<(String, String)> {
  let query = uri.query()?;
  let dummy = format!("http://local/?{query}");
  let parsed = reqwest::Url::parse(&dummy).ok()?;
  let mut remote = None;
  let mut kind = "thumb".to_string();
  for (k, v) in parsed.query_pairs() {
    if k == "u" && !v.is_empty() {
      remote = Some(v.into_owned());
    } else if k == "k" && !v.is_empty() {
      kind = v.into_owned();
    }
  }
  Some((remote?, kind))
}
