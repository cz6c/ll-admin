//! QQ 空间 Web API 客户端（自研，对照公开网页端接口）
//! 职责：相册列表、相片分页、原图/视频 URL；不依赖第三方 GPL 实现

use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, USER_AGENT};
use serde_json::Value;

use super::capture_time;
use super::session::calc_g_tk;
use super::types::{QzoneAlbumSummary, QzoneMediaBlob, QzonePhotoView, QzoneSession};

use base64::{engine::general_purpose::STANDARD as B64, Engine};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ALBUM_LIST: &str =
  "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/fcg_list_album_v3";
const PHOTO_LIST: &str =
  "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_list_photo";
/// 浮层详情：列表里的视频常只有封面或 m3u8，需此接口取 MP4 `download_url`
const FLOATVIEW_PHOTO: &str =
  "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/fcgi-bin/cgi_floatview_photo_list_v2";
/// 批量删图（对齐 qzone-api：cgi_delpic_multi_v2）；只删云端，本机保留
const DELETE_PHOTO: &str =
  "https://user.qzone.qq.com/proxy/domain/photo.qzone.qq.com/cgi-bin/common/cgi_delpic_multi_v2";

/// 机读前缀：Cookie/登录态失效；调用方应 `clear_session` 并引导重新扫码
pub const AUTH_EXPIRED_PREFIX: &str = "qzone_auth_expired:";

/**
 * 错误串是否表示 QQ 空间授权/登录态失效
 * @note 匹配前缀或常见中文/英文文案，供 command / job / 前端统一判断
 */
pub fn is_auth_expired_error(err: &str) -> bool {
  let trimmed = err.trim();
  if trimmed.starts_with(AUTH_EXPIRED_PREFIX) {
    return true;
  }
  let lower = trimmed.to_lowercase();
  lower.contains("qzone_auth_expired")
    || lower.contains("未登录")
    || lower.contains("登录失效")
    || lower.contains("登录态")
    || lower.contains("请先登录")
    || lower.contains("请重新登录")
    || lower.contains("登陆失效")
    || lower.contains("unauthorized")
    || (lower.contains("login") && (lower.contains("expire") || lower.contains("invalid")))
}

/// QQ 空间 JSONP `code` / message 是否像登录失效（非业务权限不足）
fn looks_like_auth_failure(code: i64, msg: &str) -> bool {
  // 社区常见：-3000 未登录；-10000/-10001 登录态异常；-3001 等
  if matches!(code, -3000 | -3001 | -10000 | -10001 | -1000 | -12 | -16) {
    return true;
  }
  let lower = msg.to_lowercase();
  lower.contains("未登录")
    || lower.contains("登录失效")
    || lower.contains("登录态")
    || lower.contains("请先登录")
    || lower.contains("请重新登录")
    || lower.contains("登陆失效")
    || lower.contains("skey")
    || lower.contains("p_skey")
    || lower.contains("invalid cookie")
}

fn api_code_ok(root: &Value) -> Result<(), String> {
  let code = root.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
  if code == 0 {
    return Ok(());
  }
  let msg = root
    .get("message")
    .or_else(|| root.get("msg"))
    .and_then(|v| v.as_str())
    .unwrap_or("未知错误");
  if looks_like_auth_failure(code, msg) {
    return Err(format!("{AUTH_EXPIRED_PREFIX}code={code}: {msg}"));
  }
  Err(format!("QQ 空间接口错误 code={code}: {msg}"))
}

fn map_http_status_err(kind: &str, status: reqwest::StatusCode) -> String {
  let code = status.as_u16();
  if code == 401 || code == 403 {
    return format!("{AUTH_EXPIRED_PREFIX}{kind} HTTP {code}");
  }
  format!("{kind} HTTP {code}")
}

fn now_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

fn build_client(session: &QzoneSession) -> Result<Client, String> {
  let mut headers = HeaderMap::new();
  headers.insert(
    USER_AGENT,
    HeaderValue::from_static(UA),
  );
  headers.insert(
    REFERER,
    HeaderValue::from_str(&format!("https://user.qzone.qq.com/{}/", session.uin))
      .map_err(|e| format!("Referer 非法: {e}"))?,
  );
  headers.insert(
    COOKIE,
    HeaderValue::from_str(&session.cookie_header)
      .map_err(|e| format!("Cookie 非法: {e}"))?,
  );
  // QQ 空间 CDN 在 rustls+HTTP/2 / 代理 fake-ip 下偶发「error sending request」；强制 HTTP/1.1 更稳
  Client::builder()
    .default_headers(headers)
    .timeout(std::time::Duration::from_secs(60))
    .http1_only()
    .build()
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

/// 展开 reqwest 错误链，便于区分 TLS / 代理 / 连接复位
fn format_reqwest_err(kind: &str, err: &reqwest::Error) -> String {
  let mut parts = vec![err.to_string()];
  let mut src = std::error::Error::source(err);
  while let Some(s) = src {
    let t = s.to_string();
    if !parts.iter().any(|p| p.contains(&t)) {
      parts.push(t);
    }
    src = s.source();
  }
  let detail = parts.join(" | ");
  // 本机 Clash 等 fake-ip 常见 198.18.0.0/15；传输失败时提示用户排查代理
  let hint = if detail.contains("error sending request")
    || detail.contains("connection")
    || detail.contains("timed out")
    || detail.contains("dns")
  {
    "（若开了 Clash/VPN fake-ip，请确认本应用走 TUN 或把 QQ 域名直连后重试）"
  } else {
    ""
  };
  format!("{kind}: {detail}{hint}")
}

/**
 * GET 文本；传输层失败时短暂重试（代理/fake-ip 抖动常见）
 * @note 仅重试尚未读到响应体的 send/text 失败，不重试业务 JSONP 错误
 */
fn get_text_retry(client: &Client, url: &str, kind: &str) -> Result<String, String> {
  const ATTEMPTS: u32 = 3;
  let mut last = String::new();
  for attempt in 1..=ATTEMPTS {
    match client.get(url).send() {
      Ok(resp) => match resp.text() {
        Ok(body) => return Ok(body),
        Err(e) => last = format_reqwest_err(kind, &e),
      },
      Err(e) => last = format_reqwest_err(kind, &e),
    }
    if attempt < ATTEMPTS {
      // 50ms / 150ms：避开 fake-ip 瞬时黑洞，又不拖 UI 体感
      let n = u64::from(attempt);
      std::thread::sleep(std::time::Duration::from_millis(50 * n * n));
    }
  }
  Err(last)
}

/// 仅重试 `send`（二进制下载 / 媒体流）
fn send_retry(
  client: &Client,
  url: &str,
  kind: &str,
) -> Result<reqwest::blocking::Response, String> {
  const ATTEMPTS: u32 = 3;
  let mut last = String::new();
  for attempt in 1..=ATTEMPTS {
    match client.get(url).send() {
      Ok(resp) => return Ok(resp),
      Err(e) => last = format_reqwest_err(kind, &e),
    }
    if attempt < ATTEMPTS {
      let n = u64::from(attempt);
      std::thread::sleep(std::time::Duration::from_millis(50 * n * n));
    }
  }
  Err(last)
}

/// 剥 jsonp：`shine0_Callback({...});`
fn parse_jsonp(body: &str) -> Result<Value, String> {
  let trimmed = body.trim();
  let start = trimmed
    .find('(')
    .ok_or_else(|| "响应不是 JSONP".to_string())?;
  let end = trimmed
    .rfind(')')
    .ok_or_else(|| "响应 JSONP 不完整".to_string())?;
  if end <= start + 1 {
    return Err("响应 JSONP 为空".into());
  }
  let json = &trimmed[start + 1..end];
  serde_json::from_str(json).map_err(|e| format!("解析 JSONP 失败: {e}"))
}

/// 校验会话：拉一页相册列表
pub fn probe_session(session: &QzoneSession) -> Result<(), String> {
  let _ = list_albums(session)?;
  Ok(())
}

/// 枚举本人全部相册（分页）
pub fn list_albums(session: &QzoneSession) -> Result<Vec<QzoneAlbumSummary>, String> {
  let client = build_client(session)?;
  let g_tk = calc_g_tk(&session.p_skey);
  let mut out = Vec::new();
  let mut page_start: u32 = 0;
  let page_num: u32 = 40;
  loop {
    let url = format!(
      "{ALBUM_LIST}?g_tk={g_tk}&callback=shine0_Callback&t={t}&hostUin={uin}&uin={uin}\
       &appid=4&inCharset=utf-8&outCharset=utf-8&source=qzone&plat=qzone&format=jsonp\
       &notice=0&filter=1&handset=4&pageNumModeSort={page_num}&pageNumModeClass=15\
       &needUserInfo=1&idcNum=4&mode=2&pageStart={page_start}&pageNum={page_num}\
       &callbackFun=shine0&_={ts}",
      t = now_ms() % 1_000_000_000,
      uin = session.uin,
      ts = now_ms(),
    );
    let body = get_text_retry(&client, &url, "相册列表请求失败")?;
    let root = parse_jsonp(&body)?;
    api_code_ok(&root)?;
    let data = root.get("data").cloned().unwrap_or(Value::Null);
    let list = data
      .get("albumListModeSort")
      .or_else(|| data.get("albumList"))
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();
    if list.is_empty() {
      break;
    }
    for item in &list {
      let topic_id = item
        .get("id")
        .or_else(|| item.get("topicId"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      if topic_id.is_empty() {
        continue;
      }
      let name = item
        .get("name")
        .or_else(|| item.get("desc"))
        .and_then(|v| v.as_str())
        .unwrap_or("未命名相册")
        .to_string();
      let total = item
        .get("total")
        .or_else(|| item.get("photoNum"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
      let cover_url = [
        "pre",
        "cover",
        "coverurl",
        "coverUrl",
        "bitmap",
        "url",
      ]
      .iter()
      .find_map(|k| item.get(*k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
      .unwrap_or("")
      .to_string();
      let priv_code = item
        .get("priv")
        .or_else(|| item.get("rights"))
        .and_then(|v| v.as_i64())
        .unwrap_or(1) as i32;
      out.push(QzoneAlbumSummary {
        topic_id,
        name,
        total,
        cover_url,
        album_priv: if priv_code == 0 { 1 } else { priv_code },
      });
    }
    if list.len() < page_num as usize {
      break;
    }
    page_start += page_num;
    if page_start > 2000 {
      break;
    }
  }
  Ok(out)
}

/// 单条待下载媒体（含浏览用缩略/预览 URL）
#[derive(Debug, Clone)]
pub struct QzonePhotoItem {
  pub asset_id: String,
  pub name: String,
  pub media_kind: String,
  pub capture_at: Option<String>,
  pub download_url: String,
  pub thumb_url: String,
  pub preview_url: String,
  /// 删图用；与 lloc 不同时必填
  pub sloc: String,
}

/// 分页拉取某相册媒体（本人 hostUin = uin）
pub fn list_photos(
  session: &QzoneSession,
  album_id: &str,
) -> Result<Vec<QzonePhotoItem>, String> {
  let client = build_client(session)?;
  let g_tk = calc_g_tk(&session.p_skey);
  let mut out = Vec::new();
  let mut page_start: u32 = 0;
  let page_num: u32 = 30;
  loop {
    let url = format!(
      "{PHOTO_LIST}?g_tk={g_tk}&callback=shine0_Callback&t={t}&mode=0&idcNum=4\
       &hostUin={uin}&topicId={album_id}&noTopic=0&uin={uin}&pageStart={page_start}&pageNum={page_num}\
       &skipCmtCount=0&singleurl=1&batchId=&notice=0&appid=4&inCharset=utf-8&outCharset=utf-8\
       &source=qzone&plat=qzone&outstyle=json&format=jsonp&json_esc=1&question=&answer=\
       &callbackFun=shine0&_={ts}",
      t = now_ms() % 1_000_000_000,
      uin = session.uin,
      ts = now_ms(),
    );
    let body = get_text_retry(&client, &url, "相片列表请求失败")?;
    let root = parse_jsonp(&body)?;
    api_code_ok(&root)?;
    let data = root.get("data").cloned().unwrap_or(Value::Null);
    let list = data
      .get("photoList")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();
    if list.is_empty() {
      break;
    }
    for item in &list {
      if let Some(photo) = map_photo_item(item) {
        out.push(photo);
      }
    }
    let total_in_album = data
      .get("totalInAlbum")
      .or_else(|| data.get("totalInPage"))
      .and_then(|v| v.as_u64())
      .unwrap_or(0) as u32;
    page_start += page_num;
    if page_start >= total_in_album.max(list.len() as u32) || list.len() < page_num as usize {
      break;
    }
    if page_start > 50_000 {
      break;
    }
  }
  Ok(out)
}

/// 浏览用相片列表（序列化给前端）
pub fn list_photo_views(
  session: &QzoneSession,
  album_id: &str,
) -> Result<Vec<QzonePhotoView>, String> {
  Ok(
    list_photos(session, album_id)?
      .into_iter()
      .map(|p| {
        let sloc = if p.sloc.is_empty() {
          p.asset_id.clone()
        } else {
          p.sloc
        };
        QzonePhotoView {
          asset_id: p.asset_id,
          album_id: album_id.to_string(),
          name: p.name,
          media_kind: p.media_kind,
          thumb_url: p.thumb_url,
          preview_url: p.preview_url,
          download_url: p.download_url,
          capture_at: p.capture_at,
          sloc,
          downloaded: false,
        }
      })
      .collect(),
  )
}

fn pick_str(item: &Value, keys: &[&str]) -> String {
  keys
    .iter()
    .find_map(|k| item.get(*k).and_then(|v| v.as_str()).filter(|s| !s.is_empty()))
    .unwrap_or("")
    .to_string()
}

/// HLS 播放列表无法整文件落盘给 `<video src>`，必须改走 floatview 的 MP4
pub(crate) fn is_hls_url(url: &str) -> bool {
  let u = url.to_ascii_lowercase();
  u.contains(".m3u8") || u.contains("m3u8?") || u.contains("/m3u8") || u.contains("format=m3u8")
}

/// 从 photo / video_info 取可渐进下载的地址；优先 MP4 `download_url`，避开 m3u8
fn extract_video_stream_url(item: &Value) -> String {
  if let Some(info) = item.get("video_info") {
    let download = pick_str(info, &["download_url", "downloadUrl"]);
    if !download.is_empty() && !is_hls_url(&download) {
      return download;
    }
    let play = pick_str(
      info,
      &["video_url", "videoUrl", "playurl", "play_url", "url"],
    );
    if !play.is_empty() && !is_hls_url(&play) {
      return play;
    }
    // 列表里常只剩 HLS：返回空，迫使预览/下载走 floatview
    if !download.is_empty() || !play.is_empty() {
      return String::new();
    }
  }
  let top = pick_str(item, &["video_url", "videoUrl", "playurl", "play_url"]);
  if is_hls_url(&top) {
    String::new()
  } else {
    top
  }
}

/**
 * 通过浮层详情接口解析视频的可下载 MP4 URL
 * @note 公开网页端协议（cgi_floatview_photo_list_v2）；列表接口的 video_url 多为 m3u8/封面
 * @param album_id 相册 topicId
 * @param pic_key 相片 lloc / picKey
 */
pub fn resolve_video_download_url(
  session: &QzoneSession,
  album_id: &str,
  pic_key: &str,
) -> Result<String, String> {
  if album_id.trim().is_empty() || pic_key.trim().is_empty() {
    return Err("解析视频需要 albumId 与 picKey".into());
  }
  let client = build_client(session)?;
  let g_tk = calc_g_tk(&session.p_skey);
  let url = format!(
    "{FLOATVIEW_PHOTO}?g_tk={g_tk}&t={t}&topicId={album_id}&picKey={pic_key}\
     &shootTime=&cmtOrder=1&fupdate=1&plat=qzone&source=qzone&cmtNum=10&likeNum=5\
     &inCharset=utf-8&outCharset=utf-8&callbackFun=viewer&offset=0&number=15\
     &uin={uin}&hostUin={uin}&appid=4&isFirst=1&sortOrder=1&showMode=1\
     &need_private_comment=1&prevNum=9&postNum=18&callback=viewer_Callback&_={ts}",
    t = (now_ms() % 1_000_000_000) as f64 / 1e9,
    uin = session.uin,
    ts = now_ms(),
  );
  let body = get_text_retry(&client, &url, "视频详情请求失败")?;
  let root = parse_jsonp(&body)?;
  api_code_ok(&root)?;
  let photos = root
    .get("data")
    .and_then(|d| d.get("photos"))
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();
  if photos.is_empty() {
    return Err("视频详情无 photos".into());
  }
  let mut photo_data: Option<&Value> = None;
  for photo in &photos {
    let key = pick_str(photo, &["picKey", "lloc", "sloc"]);
    if key == pic_key {
      photo_data = Some(photo);
      break;
    }
  }
  if photo_data.is_none() {
    for photo in &photos {
      let is_v = photo
        .get("is_video")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || photo.get("is_video").and_then(|v| v.as_i64()) == Some(1)
        || photo.get("video_info").is_some();
      if is_v {
        photo_data = Some(photo);
        break;
      }
    }
  }
  let photo_data = photo_data.unwrap_or(&photos[0]);
  let info = photo_data
    .get("video_info")
    .ok_or_else(|| "详情无 video_info".to_string())?;
  let download = pick_str(info, &["download_url", "downloadUrl"]);
  if !download.is_empty() && !is_hls_url(&download) {
    return Ok(download);
  }
  let play = pick_str(
    info,
    &["video_url", "videoUrl", "playurl", "play_url", "url"],
  );
  if !play.is_empty() && !is_hls_url(&play) {
    return Ok(play);
  }
  if is_hls_url(&download) || is_hls_url(&play) {
    return Err("该视频仅提供 HLS(m3u8)，暂不支持在线预览/整文件下载".into());
  }
  Err("video_info 中无可用 MP4 地址".into())
}

fn map_photo_item(item: &Value) -> Option<QzonePhotoItem> {
  let lloc = item.get("lloc").and_then(|v| v.as_str()).unwrap_or("");
  let sloc = item.get("sloc").and_then(|v| v.as_str()).unwrap_or("");
  let asset_id = if !lloc.is_empty() {
    lloc.to_string()
  } else if !sloc.is_empty() {
    sloc.to_string()
  } else {
    return None;
  };
  let name = item
    .get("name")
    .or_else(|| item.get("desc"))
    .and_then(|v| v.as_str())
    .unwrap_or(&asset_id)
    .to_string();
  let is_video = item
    .get("is_video")
    .and_then(|v| v.as_bool())
    .unwrap_or(false)
    || item.get("type").and_then(|v| v.as_str()) == Some("video")
    || item.get("is_video").and_then(|v| v.as_i64()) == Some(1);
  let photo_url = pick_str(
    item,
    &[
      "origin_url",
      "raw",
      "rawshoot",
      "downloadUrl",
      "download_url",
      "url",
    ],
  );
  let video_stream = extract_video_stream_url(item);
  // 视频：列表常无 MP4（仅封面/m3u8）；download_url 可空，预览/落盘再走 floatview
  let download_url = if is_video {
    video_stream
  } else if !photo_url.is_empty() {
    photo_url.clone()
  } else {
    return None;
  };
  let thumb_url = {
    let t = pick_str(item, &["pre", "thumb", "smallurl", "url"]);
    if !t.is_empty() {
      t
    } else if !photo_url.is_empty() {
      photo_url.clone()
    } else {
      download_url.clone()
    }
  };
  if thumb_url.is_empty() && download_url.is_empty() {
    return None;
  }
  let preview_url = if is_video {
    if !download_url.is_empty() {
      download_url.clone()
    } else {
      thumb_url.clone()
    }
  } else {
    let p = pick_str(item, &["bigurl", "burl", "origin_url", "raw", "url"]);
    if p.is_empty() {
      download_url.clone()
    } else {
      p
    }
  };
  let capture_at = capture_time::resolve_from_photo_json(item).map(|i| i.display);
  Some(QzonePhotoItem {
    asset_id: asset_id.clone(),
    name,
    media_kind: if is_video {
      "video".into()
    } else {
      "image".into()
    },
    capture_at,
    download_url,
    thumb_url,
    preview_url,
    sloc: if sloc.is_empty() {
      asset_id
    } else {
      sloc.to_string()
    },
  })
}

/// 允许代理的图片/视频域名（防任意 URL SSRF）
fn allowed_media_host(host: &str) -> bool {
  let h = host.to_ascii_lowercase();
  h.ends_with(".qq.com")
    || h.ends_with(".qpic.cn")
    || h.ends_with(".qlogo.cn")
    || h.ends_with(".gtimg.cn")
    || h.ends_with(".myqcloud.com")
    || h.ends_with(".qcloud.com")
    || h == "qq.com"
    || h == "qpic.cn"
}

/**
 * 带会话 Cookie 拉取媒体字节
 * @param max_bytes 可选上限；缩略图/协议建议较小值
 * @note 域名白名单，避免把代理当成开放代理
 */
pub fn fetch_media_bytes(
  session: &QzoneSession,
  url: &str,
  max_bytes: Option<usize>,
) -> Result<(String, Vec<u8>), String> {
  let parsed = reqwest::Url::parse(url).map_err(|e| format!("媒体 URL 非法: {e}"))?;
  if parsed.scheme() != "http" && parsed.scheme() != "https" {
    return Err("仅支持 http(s) 媒体".into());
  }
  let host = parsed.host_str().unwrap_or("");
  if !allowed_media_host(host) {
    return Err(format!("不允许的媒体域名: {host}"));
  }
  let limit = max_bytes.unwrap_or(25 * 1024 * 1024);
  let client = build_client(session)?;
  let resp = send_retry(&client, url, "拉取媒体失败")?;
  if !resp.status().is_success() {
    return Err(map_http_status_err("拉取媒体", resp.status()));
  }
  if let Some(len) = resp.content_length() {
    if len as usize > limit {
      return Err("媒体过大，请下载到本地后查看".into());
    }
  }
  let content_type = resp
    .headers()
    .get(reqwest::header::CONTENT_TYPE)
    .and_then(|v| v.to_str().ok())
    .unwrap_or("application/octet-stream")
    .split(';')
    .next()
    .unwrap_or("application/octet-stream")
    .trim()
    .to_string();
  let bytes = resp
    .bytes()
    .map_err(|e| format_reqwest_err("读取媒体失败", &e))?;
  if bytes.len() > limit {
    return Err("媒体过大，请下载到本地后查看".into());
  }
  Ok((content_type, bytes.to_vec()))
}

/**
 * 将远端媒体落到本地缓存文件，返回绝对路径（供 convertFileSrc / `<video>`）
 * @note 视频不宜走 qzoneimg 整包协议：无 Range 且体积常超预览上限
 */
pub fn cache_media_to_file(
  session: &QzoneSession,
  url: &str,
  dest_dir: &std::path::Path,
  max_bytes: usize,
) -> Result<std::path::PathBuf, String> {
  std::fs::create_dir_all(dest_dir).map_err(|e| format!("创建预览缓存目录失败: {e}"))?;
  let key = blake3::hash(url.as_bytes()).to_hex().to_string();
  if let Some(hit) = find_cached_by_key(dest_dir, &key) {
    return Ok(hit);
  }
  let (ctype, bytes) = fetch_media_bytes(session, url, Some(max_bytes))?;
  // 误把 HLS playlist 当视频落盘会导致 <video> 黑屏
  if ctype.to_ascii_lowercase().contains("mpegurl")
    || ctype.to_ascii_lowercase().contains("m3u8")
    || bytes.starts_with(b"#EXTM3U")
  {
    return Err("拉取结果是 HLS(m3u8)，无法本地预览".into());
  }
  let ext = ext_from_url_or_ctype(url, &ctype);
  let path = dest_dir.join(format!("{key}.{ext}"));
  std::fs::write(&path, &bytes).map_err(|e| format!("写入预览缓存失败: {e}"))?;
  Ok(path)
}

fn find_cached_by_key(dir: &std::path::Path, key: &str) -> Option<std::path::PathBuf> {
  let rd = std::fs::read_dir(dir).ok()?;
  for ent in rd.flatten() {
    let name = ent.file_name();
    let name = name.to_string_lossy();
    if name.starts_with(key) && name.contains('.') {
      let path = ent.path();
      if path.is_file() {
        if let Ok(meta) = std::fs::metadata(&path) {
          if meta.len() > 0 {
            return Some(path);
          }
        }
      }
    }
  }
  None
}

fn ext_from_url_or_ctype(url: &str, ctype: &str) -> String {
  let from_ctype = match ctype.to_ascii_lowercase().as_str() {
    t if t.contains("mp4") => Some("mp4"),
    t if t.contains("webm") => Some("webm"),
    t if t.contains("quicktime") || t.contains("mov") => Some("mov"),
    t if t.contains("jpeg") => Some("jpg"),
    t if t.contains("png") => Some("png"),
    t if t.contains("gif") => Some("gif"),
    t if t.contains("webp") => Some("webp"),
    _ => None,
  };
  if let Some(e) = from_ctype {
    return e.into();
  }
  if let Some(ext) = std::path::Path::new(url)
    .extension()
    .and_then(|e| e.to_str())
  {
    let e = ext.to_ascii_lowercase();
    if matches!(
      e.as_str(),
      "mp4" | "mov" | "webm" | "jpg" | "jpeg" | "png" | "gif" | "webp"
    ) {
      return if e == "jpeg" { "jpg".into() } else { e };
    }
  }
  "bin".into()
}

/**
 * 从 QQ 空间删除本人相册中的照片/视频（本机文件不动）
 * @param priv_code 相册 priv/rights；≤0 时按 1
 * @param pairs (lloc, sloc)；sloc 空则用 lloc
 * @note 对齐公开网页端 `cgi_delpic_multi_v2` + form `codelist`
 */
pub fn delete_photos(
  session: &QzoneSession,
  album_id: &str,
  priv_code: i32,
  pairs: &[(String, String)],
) -> Result<(), String> {
  if album_id.trim().is_empty() {
    return Err("album_id 不能为空".into());
  }
  if pairs.is_empty() {
    return Ok(());
  }
  let priv_n = if priv_code <= 0 { 1 } else { priv_code };
  let client = build_client(session)?;
  let g_tk = calc_g_tk(&session.p_skey);
  let uin: i64 = session
    .uin
    .parse()
    .map_err(|_| format!("uin 非法: {}", session.uin))?;

  // 分批：单请求过多易失败；每批最多 20
  for chunk in pairs.chunks(20) {
    let codelist = chunk
      .iter()
      .map(|(lloc, sloc)| {
        let s = if sloc.trim().is_empty() {
          lloc.as_str()
        } else {
          sloc.as_str()
        };
        format!("{lloc}|53|0|0||{s}|{priv_n}|0")
      })
      .collect::<Vec<_>>()
      .join(",");
    let url = format!("{DELETE_PHOTO}?g_tk={g_tk}");
    let form = [
      ("qzreferrer", format!("https://user.qzone.qq.com/{uin}")),
      ("albumid", album_id.to_string()),
      ("nvip", "1".into()),
      ("priv", priv_n.to_string()),
      ("codelist", codelist),
      ("ismultiup", "0".into()),
      ("resetcover", "1".into()),
      ("newcover", String::new()),
      ("uin", uin.to_string()),
      ("hostUin", uin.to_string()),
      ("plat", "qzone".into()),
      ("source", "qzone".into()),
      ("inCharset", "utf-8".into()),
      ("outCharset", "utf-8".into()),
      ("format", "json".into()),
    ];
    let resp = client
      .post(&url)
      .form(&form)
      .send()
      .map_err(|e| format_reqwest_err("删图请求失败", &e))?;
    let status = resp.status();
    if !status.is_success() {
      return Err(map_http_status_err("删图", status));
    }
    let body = resp
      .text()
      .map_err(|e| format_reqwest_err("读删图响应失败", &e))?;
    let root = parse_delete_response(&body)?;
    api_code_ok(&root)?;
  }
  Ok(())
}

/// 删图响应可能是纯 JSON 或带 callback 的包装
fn parse_delete_response(body: &str) -> Result<Value, String> {
  let trimmed = body.trim();
  if trimmed.starts_with('{') {
    return serde_json::from_str(trimmed).map_err(|e| format!("解析删图 JSON 失败: {e}"));
  }
  if let Ok(v) = parse_jsonp(trimmed) {
    return Ok(v);
  }
  // frameElement.callback({...})
  if let Some(start) = trimmed.find('{') {
    if let Some(end) = trimmed.rfind('}') {
      if end > start {
        return serde_json::from_str(&trimmed[start..=end])
          .map_err(|e| format!("解析删图回调 JSON 失败: {e}"));
      }
    }
  }
  Err(format!(
    "无法解析删图响应: {}",
    trimmed.chars().take(120).collect::<String>()
  ))
}

/// invoke 用：字节再转 base64（热路径请走 qzoneimg 协议，勿用此接口刷缩略图）
pub fn fetch_media_blob(
  session: &QzoneSession,
  url: &str,
  max_bytes: Option<usize>,
) -> Result<QzoneMediaBlob, String> {
  let (content_type, bytes) = fetch_media_bytes(session, url, max_bytes)?;
  Ok(QzoneMediaBlob {
    content_type,
    data_base64: B64.encode(&bytes),
  })
}

/// 流式下载到目标路径（已存在且非空则跳过，由调用方处理）
pub fn download_file(session: &QzoneSession, url: &str, dest: &std::path::Path) -> Result<(), String> {
  let client = build_client(session)?;
  let mut resp = send_retry(&client, url, "下载请求失败")?;
  if !resp.status().is_success() {
    return Err(map_http_status_err("下载", resp.status()));
  }
  if let Some(parent) = dest.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
  }
  let mut file =
    std::fs::File::create(dest).map_err(|e| format!("创建文件失败: {e}"))?;
  std::io::copy(&mut resp, &mut file).map_err(|e| format!("写入文件失败: {e}"))?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn auth_expired_prefix_and_codes() {
    assert!(is_auth_expired_error(
      "qzone_auth_expired:code=-3000: 未登录"
    ));
    assert!(is_auth_expired_error("请先登录"));
    assert!(!is_auth_expired_error(
      "QQ 空间接口错误 code=-1: 未知错误"
    ));
    assert!(looks_like_auth_failure(-3000, "x"));
    assert!(!looks_like_auth_failure(-1, "rate limited"));
  }
}
