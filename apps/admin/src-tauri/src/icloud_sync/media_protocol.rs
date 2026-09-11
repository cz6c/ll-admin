//! iCloud 在线缩略图自定义协议 `icloudimg`
//! 职责：WebView 按 asset_id 拉 sidecar thumb（磁盘缓存 + 全局限流）
//! 适用：`http://icloudimg.localhost/?id=<urlencoded asset_id>&k=thumb`
//!
//! 为何只做 thumb：产品锁定减轻 Apple/带宽负担；缺衍生返回错误，不回落 ORIGINAL。
//! 为何限流：列表一次会打出大量请求；sidecar 单飞，无门闸会全部挂起。

use std::fs;
use std::path::PathBuf;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

use serde_json::json;
use tauri::http::{header, Request, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeContext, UriSchemeResponder, Wry};

use super::queue::SidecarClientHandle;
use super::settings::{icloud_sync_dir, load_settings};
use super::sidecar::session_dir;

/// 同时向 sidecar 发起预览上限（sidecar 本身单飞，>2 只会堆线程）
const MAX_INFLIGHT: u32 = 2;
/// thumb 体积上限（与 sidecar PREVIEW_PROBE_MAX_BYTES.thumb 对齐）
const THUMB_MAX: u64 = 2 * 1024 * 1024;

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
 * 异步协议入口（由 lib.rs 注册为 `icloudimg`）
 * 后台线程经 sidecar `preview_probe` 拉 thumb，不堵 WebView 主线程
 */
pub fn handle_request(
  ctx: UriSchemeContext<'_, Wry>,
  request: Request<Vec<u8>>,
  responder: UriSchemeResponder,
) {
  let app = ctx.app_handle().clone();
  std::thread::spawn(move || {
    let response = match serve_thumb(&app, request.uri()) {
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

fn serve_thumb(app: &AppHandle, uri: &tauri::http::Uri) -> Result<(String, Vec<u8>), StatusCode> {
  let (asset_id, kind) = extract_params(uri).ok_or(StatusCode::BAD_REQUEST)?;
  // 产品锁定：仅 thumb；其它 size 直接拒绝，避免误拉 medium/原图
  if kind != "thumb" {
    return Err(StatusCode::BAD_REQUEST);
  }

  if let Some(hit) = read_cache(app, &asset_id) {
    return Ok(hit);
  }

  let settings = load_settings(app).map_err(|_| StatusCode::UNAUTHORIZED)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err(StatusCode::UNAUTHORIZED);
  }
  let session_path = session_dir(app).map_err(|_| StatusCode::UNAUTHORIZED)?;

  let dest = cache_bin_path(app, &asset_id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
  if let Some(parent) = dest.parent() {
    fs::create_dir_all(parent).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
  }

  let handle = app
    .state::<SidecarClientHandle>()
    .client();

  acquire_fetch_slot();
  // 缩略图不必等满 120s；超时尽快失败，避免 WebView 长时间 LOADING 卡死感
  let event = handle.request_with_timeout(
    app,
    json!({
      "cmd": "preview_probe",
      "apple_id": apple_id,
      "session_dir": session_path.to_string_lossy(),
      "asset_id": asset_id,
      "size": "thumb",
      "dest_path": dest.to_string_lossy(),
    }),
    Duration::from_secs(45),
  );
  release_fetch_slot();

  let event = event.map_err(|_| StatusCode::BAD_GATEWAY)?;
  if event.event_type != "done" {
    let code = event.code.unwrap_or_default();
    if code == "preview_size_missing" || code == "auth_failed" || code == "session_expired" {
      return Err(StatusCode::NOT_FOUND);
    }
    return Err(StatusCode::BAD_GATEWAY);
  }

  let meta = fs::metadata(&dest).map_err(|_| StatusCode::BAD_GATEWAY)?;
  if meta.len() == 0 || meta.len() > THUMB_MAX {
    let _ = fs::remove_file(&dest);
    return Err(StatusCode::PAYLOAD_TOO_LARGE);
  }

  let bytes = fs::read(&dest).map_err(|_| StatusCode::BAD_GATEWAY)?;
  let ctype = event
    .extra
    .get("content_type")
    .and_then(|v| v.as_str())
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("image/jpeg")
    .to_string();
  // 探针可能返回 application/octet-stream；按魔数纠正，便于 WebView 解码
  let ctype = sniff_image_ctype(&bytes).unwrap_or(ctype);
  write_ctype_meta(app, &asset_id, &ctype);
  Ok((ctype, bytes))
}

fn sniff_image_ctype(bytes: &[u8]) -> Option<String> {
  if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
    return Some("image/jpeg".into());
  }
  if bytes.len() >= 8 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
    return Some("image/png".into());
  }
  if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
    return Some("image/webp".into());
  }
  None
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = icloud_sync_dir(app)?.join("media-cache");
  fs::create_dir_all(&dir).map_err(|e| format!("创建 iCloud 媒体缓存目录失败: {e}"))?;
  Ok(dir)
}

fn cache_key(asset_id: &str) -> String {
  blake3::hash(format!("thumb:{asset_id}").as_bytes())
    .to_hex()
    .to_string()
}

fn cache_bin_path(app: &AppHandle, asset_id: &str) -> Result<PathBuf, String> {
  Ok(cache_dir(app)?.join(format!("{}.bin", cache_key(asset_id))))
}

fn ctype_meta_path(app: &AppHandle, asset_id: &str) -> Result<PathBuf, String> {
  Ok(cache_dir(app)?.join(format!("{}.ctype", cache_key(asset_id))))
}

fn read_cache(app: &AppHandle, asset_id: &str) -> Option<(String, Vec<u8>)> {
  let bin = cache_bin_path(app, asset_id).ok()?;
  let meta = ctype_meta_path(app, asset_id).ok()?;
  if !bin.is_file() {
    return None;
  }
  let bytes = fs::read(&bin).ok()?;
  if bytes.is_empty() || bytes.len() as u64 > THUMB_MAX {
    return None;
  }
  let ctype = fs::read_to_string(&meta)
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .or_else(|| sniff_image_ctype(&bytes))
    .unwrap_or_else(|| "image/jpeg".into());
  Some((ctype, bytes))
}

fn write_ctype_meta(app: &AppHandle, asset_id: &str, ctype: &str) {
  if let Ok(path) = ctype_meta_path(app, asset_id) {
    let _ = fs::write(path, ctype);
  }
}

/// `id` = asset_id；`k` 仅接受 thumb
fn extract_params(uri: &tauri::http::Uri) -> Option<(String, String)> {
  let query = uri.query()?;
  let dummy = format!("http://local/?{query}");
  let parsed = reqwest::Url::parse(&dummy).ok()?;
  let mut asset_id = None;
  let mut kind = "thumb".to_string();
  for (k, v) in parsed.query_pairs() {
    if k == "id" && !v.is_empty() {
      asset_id = Some(v.into_owned());
    } else if k == "k" && !v.is_empty() {
      kind = v.into_owned();
    }
  }
  Some((asset_id?, kind))
}

#[cfg(test)]
mod tests {
  use super::sniff_image_ctype;

  #[test]
  fn sniff_jpeg_magic() {
    let bytes = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
    assert_eq!(sniff_image_ctype(&bytes).as_deref(), Some("image/jpeg"));
  }
}
