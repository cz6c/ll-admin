//! QQ 空间扫码登录（ptlogin2）
//! 职责：拉取二维码、轮询扫码状态、取 Cookie 落会话
//! 适用：QzoneSyncFab 扫码登录主路径
//!
//! 流程对齐开源 MIT 实现 [PyQQSkeyTool](https://github.com/sun589/PyQQSkeyTool)
//!（`QrLogin("qzone.qq.com")`：ptqrshow → ptqrlogin → GET check_sig 且 **禁止跟跳**）

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, SET_COOKIE};
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::client;
use super::session::{self, calc_g_tk};
use super::types::{QzoneAuthState, QzoneSession};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
/// 与 PyQQSkeyTool qzone.qq.com 预设一致
const APPID: &str = "549000912";
const DAID: &str = "5";
const U1: &str = "https://qzs.qq.com/qzone/v5/loginsucc.html?para=izone";
/// 二维码有效期（前端提示；服务端超时按此判断）
const QR_TTL_SECS: u64 = 120;

/// 进行中的扫码会话（进程内）
#[derive(Clone)]
struct QrPending {
  qrsig: String,
  started: Instant,
}

/// 扫码状态机（挂在 QzoneSyncState）
pub struct QrLoginGate {
  pending: Mutex<Option<QrPending>>,
}

impl QrLoginGate {
  pub fn new() -> Self {
    Self {
      pending: Mutex::new(None),
    }
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneQrStartResult {
  /// `data:image/png;base64,...`
  pub image_data_url: String,
  pub expires_in_secs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QzoneQrStatus {
  /// 等待扫码
  Waiting,
  /// 已扫码，待手机确认
  Scanned,
  /// 二维码过期
  Expired,
  /// 登录成功
  Success,
  /// 其它错误
  Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneQrPollResult {
  pub status: QzoneQrStatus,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub auth: Option<QzoneAuthState>,
}

fn now_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

/// qrsig → ptqrtoken（hash33；同 PyQQSkeyTool `ptqrToken`）
fn ptqrtoken(qrsig: &str) -> i64 {
  let mut e: i64 = 0;
  for b in qrsig.bytes() {
    e = e.wrapping_add((e << 5).wrapping_add(b as i64));
  }
  e & 0x7fff_ffff
}

fn http_client() -> Result<Client, String> {
  // 与 requests(allow_redirects=False) 一致：禁止自动跟跳，才能读到 check_sig 的 Set-Cookie
  Client::builder()
    .redirect(Policy::none())
    .timeout(Duration::from_secs(30))
    .user_agent(UA)
    .build()
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

fn merge_set_cookies(map: &mut HashMap<String, String>, headers: &HeaderMap) {
  for val in headers.get_all(SET_COOKIE) {
    let Ok(s) = val.to_str() else { continue };
    let first = s.split(';').next().unwrap_or("").trim();
    let Some((k, v)) = first.split_once('=') else {
      continue;
    };
    let key = k.trim();
    if key.is_empty() {
      continue;
    }
    // 空值不覆盖已有票（跟跳页偶发清空同名 Cookie）
    let value = v.trim().to_string();
    if value.is_empty() {
      continue;
    }
    map.insert(key.to_string(), value);
  }
}

fn extract_qrsig(headers: &HeaderMap) -> Option<String> {
  for val in headers.get_all(SET_COOKIE) {
    let Ok(s) = val.to_str() else { continue };
    for part in s.split(';') {
      let part = part.trim();
      if let Some(v) = part.strip_prefix("qrsig=") {
        if !v.is_empty() {
          return Some(v.to_string());
        }
      }
    }
  }
  None
}

/**
 * 开始扫码：拉取二维码图并缓存 qrsig
 * @note URL 形态对齐 PyQQSkeyTool.getQrcode
 */
pub fn start_qr(gate: &QrLoginGate) -> Result<QzoneQrStartResult, String> {
  let client = http_client()?;
  let t = (now_ms() as f64) / 1_000_000_000.0;
  let url = format!(
    "https://ssl.ptlogin2.qq.com/ptqrshow?appid={APPID}&t={t}&daid={DAID}&pt_3rd_aid=0&u1={}",
    urlencoding_encode(U1)
  );
  let resp = client
    .get(&url)
    .send()
    .map_err(|e| format!("获取二维码失败: {e}"))?;
  if !resp.status().is_success() {
    return Err(format!("获取二维码 HTTP {}", resp.status()));
  }
  let qrsig = extract_qrsig(resp.headers()).ok_or_else(|| "未返回 qrsig，请重试".to_string())?;
  let bytes = resp
    .bytes()
    .map_err(|e| format!("读取二维码图片失败: {e}"))?;
  if bytes.is_empty() {
    return Err("二维码图片为空".into());
  }
  let image_data_url = format!("data:image/png;base64,{}", B64.encode(&bytes));

  *gate
    .pending
    .lock()
    .map_err(|_| "扫码状态锁失败".to_string())? = Some(QrPending {
    qrsig,
    started: Instant::now(),
  });

  Ok(QzoneQrStartResult {
    image_data_url,
    expires_in_secs: QR_TTL_SECS as u32,
  })
}

/**
 * 轮询扫码结果；成功则 probe 相册接口并持久化会话
 */
pub fn poll_qr(app: &AppHandle, gate: &QrLoginGate) -> Result<QzoneQrPollResult, String> {
  let pending = {
    let g = gate
      .pending
      .lock()
      .map_err(|_| "扫码状态锁失败".to_string())?;
    g.clone()
  };
  let Some(pending) = pending else {
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Expired,
      message: "请先获取二维码".into(),
      auth: None,
    });
  };

  if pending.started.elapsed() > Duration::from_secs(QR_TTL_SECS) {
    clear_pending(gate);
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Expired,
      message: "二维码已过期，请刷新".into(),
      auth: None,
    });
  }

  let client = http_client()?;
  let token = ptqrtoken(&pending.qrsig);
  // 对齐 PyQQSkeyTool.check_scanning_status 查询串（login_sig 留空）
  let url = format!(
    "https://ssl.ptlogin2.qq.com/ptqrlogin?u1={u1}&ptqrtoken={token}&ptredirect=0&h=1&t=1&g=1\
     &from_ui=1&ptlang=2052&action={ts}&js_ver=23111510&js_type=1&login_sig=\
     &pt_uistyle=40&aid={APPID}&daid={DAID}&&o1vId=&pt_js_version=v1.48.1",
    u1 = urlencoding_encode(U1),
    ts = now_ms(),
  );

  let resp = client
    .get(&url)
    .header(
      COOKIE,
      HeaderValue::from_str(&format!("qrsig={}", pending.qrsig))
        .map_err(|e| format!("Cookie 非法: {e}"))?,
    )
    .send()
    .map_err(|e| format!("轮询扫码失败: {e}"))?;

  let mut poll_cookies = HashMap::new();
  merge_set_cookies(&mut poll_cookies, resp.headers());

  let body = resp
    .text()
    .map_err(|e| format!("读取扫码响应失败: {e}"))?;

  // 文案优先（与 Py 一致），再回退 ptuiCB code
  if body.contains("二维码未失效") {
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Waiting,
      message: "请使用手机 QQ 扫码".into(),
      auth: None,
    });
  }
  if body.contains("二维码已失效") {
    clear_pending(gate);
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Expired,
      message: "二维码已失效，请刷新".into(),
      auth: None,
    });
  }
  if body.contains("二维码认证中") {
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Scanned,
      message: "已扫码，请在手机上确认".into(),
      auth: None,
    });
  }
  if body.contains("拒绝") {
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Error,
      message: "已在手机上拒绝登录".into(),
      auth: None,
    });
  }

  let fields = parse_ptui_cb(&body).unwrap_or_default();
  let code = fields.first().map(String::as_str).unwrap_or("");
  let success = body.contains("成功") || code == "0";
  if !success {
    let msg = fields
      .get(4)
      .cloned()
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| {
        if body.len() > 120 {
          format!("扫码失败: {}…", body.chars().take(80).collect::<String>())
        } else {
          format!("扫码失败: {body}")
        }
      });
    return Ok(QzoneQrPollResult {
      status: QzoneQrStatus::Error,
      message: msg,
      auth: None,
    });
  }

  // login_url：ptuiCB 第 3 段，或正文中第一个 https URL（同 URLExtract）
  let redirect = fields
    .get(2)
    .cloned()
    .filter(|s| !s.is_empty())
    .or_else(|| extract_first_https_url(&body))
    .ok_or_else(|| "登录成功但缺少跳转地址".to_string())?;

  let uin_hint = poll_cookies
    .get("uin")
    .or_else(|| poll_cookies.get("p_uin"))
    .map(|s| normalize_uin(s))
    .filter(|s| !s.is_empty());

  let session = finish_login_like_py(&client, &redirect, uin_hint.as_deref())?;
  client::probe_session(&session)?;
  session::save_session(app, &session)?;
  clear_pending(gate);
  Ok(QzoneQrPollResult {
    status: QzoneQrStatus::Success,
    message: format!("登录成功 QQ {}", session.uin),
    auth: Some(QzoneAuthState {
      logged_in: true,
      uin: Some(session.uin),
    }),
  })
}

fn clear_pending(gate: &QrLoginGate) {
  if let Ok(mut g) = gate.pending.lock() {
    *g = None;
  }
}

/// `ptuiCB('66','0','','0','…', '');`
fn parse_ptui_cb(body: &str) -> Result<Vec<String>, String> {
  let start = body
    .find("ptuiCB(")
    .ok_or_else(|| format!("非预期扫码响应: {}", body.chars().take(80).collect::<String>()))?;
  let rest = &body[start + "ptuiCB(".len()..];
  let end = rest
    .rfind(')')
    .ok_or_else(|| "扫码响应不完整".to_string())?;
  let inner = &rest[..end];
  let mut fields = Vec::new();
  let mut chars = inner.chars().peekable();
  while let Some(c) = chars.next() {
    if c != '\'' {
      continue;
    }
    let mut s = String::new();
    for c2 in chars.by_ref() {
      if c2 == '\'' {
        break;
      }
      s.push(c2);
    }
    fields.push(s);
  }
  if fields.is_empty() {
    return Err("无法解析 ptuiCB".into());
  }
  Ok(fields)
}

/**
 * 对齐 PyQQSkeyTool.getCookies：对 login_url 单次 GET、不跟跳，直接取 Set-Cookie
 * @note 切勿再跟到 loginsucc：后续跳转可能下发空 p_skey 覆盖有效票
 */
fn finish_login_like_py(
  client: &Client,
  login_url: &str,
  uin_hint: Option<&str>,
) -> Result<QzoneSession, String> {
  let resp = client
    .get(login_url)
    .send()
    .map_err(|e| format!("访问登录跳转失败: {e}"))?;

  let mut cookies = HashMap::new();
  merge_set_cookies(&mut cookies, resp.headers());

  let uin = normalize_uin(
    cookies
      .get("uin")
      .or_else(|| cookies.get("p_uin"))
      .map(String::as_str)
      .unwrap_or(""),
  );
  let uin = if uin.is_empty() {
    uin_hint.unwrap_or("").to_string()
  } else {
    uin
  };
  if uin.is_empty() {
    return Err("登录成功但未取得 QQ 号".into());
  }

  let p_skey = cookies
    .get("p_skey")
    .cloned()
    .filter(|s| !s.is_empty())
    .ok_or_else(|| {
      let keys: Vec<_> = cookies.keys().cloned().collect();
      log::warn!("qzone_sync: check_sig cookies (no follow): {keys:?}");
      "登录成功但未取得 p_skey，请刷新二维码重试".to_string()
    })?;
  let skey = cookies.get("skey").cloned().unwrap_or_default();

  let mut pairs = vec![
    format!("uin=o{uin}"),
    format!("p_uin=o{uin}"),
    format!("p_skey={p_skey}"),
  ];
  if !skey.is_empty() {
    pairs.push(format!("skey={skey}"));
  }
  for (k, v) in cookies.iter() {
    if matches!(k.as_str(), "uin" | "p_uin" | "p_skey" | "skey" | "qrsig") {
      continue;
    }
    if v.bytes().all(|b| (0x20..=0x7e).contains(&b) && b != b';') {
      pairs.push(format!("{k}={v}"));
    }
  }

  let session = QzoneSession {
    uin,
    p_skey,
    skey,
    cookie_header: pairs.join("; "),
  };
  let _ = calc_g_tk(&session.p_skey);
  Ok(session)
}

fn extract_first_https_url(body: &str) -> Option<String> {
  let start = body.find("https://")?;
  let rest = &body[start..];
  let end = rest
    .find(|c: char| c == '\'' || c == '"' || c.is_whitespace() || c == ',')
    .unwrap_or(rest.len());
  let url = rest[..end].trim_end_matches(')');
  if url.len() > 12 {
    Some(url.to_string())
  } else {
    None
  }
}

fn normalize_uin(raw: &str) -> String {
  raw
    .trim()
    .trim_start_matches('o')
    .trim_start_matches('O')
    .chars()
    .filter(|c| c.is_ascii_digit())
    .collect()
}

fn urlencoding_encode(s: &str) -> String {
  let mut out = String::new();
  for b in s.bytes() {
    match b {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
        out.push(b as char);
      }
      _ => out.push_str(&format!("%{b:02X}")),
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ptqrtoken_stable() {
    assert!(ptqrtoken("abc") > 0);
  }

  #[test]
  fn parse_waiting() {
    let body = r#"ptuiCB('66','0','','0','二维码未失效。', '');"#;
    let f = parse_ptui_cb(body).unwrap();
    assert_eq!(f[0], "66");
    assert_eq!(f[4], "二维码未失效。");
  }

  #[test]
  fn extract_check_sig_url() {
    let body = r#"ptuiCB('0','0','https://ptlogin2.qzone.qq.com/check_sig?pttype=1','0','登录成功！', 'x');"#;
    assert!(extract_first_https_url(body)
      .unwrap()
      .contains("check_sig"));
  }
}
