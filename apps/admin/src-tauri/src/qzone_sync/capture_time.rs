//! QQ 空间媒体拍摄时间解析
//! 职责：从 list/floatview 相片 JSON 按 QzonePhoto 优先级取时间；供 catalog / 文件名 unix / mtime / EXIF
//! 适用：qzone_sync catalog 与下载后元数据；**无「当前时间」兜底**（避免伪拍摄时间）

use chrono::{Local, NaiveDateTime, TimeZone};
use serde_json::Value;

/// 解析得到的拍摄/上传时刻
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureInstant {
  pub unix_secs: i64,
  /// 写入 state.db 的规范串：`YYYY-MM-DD HH:MM:SS`（本地墙钟）
  pub display: String,
}

/**
 * 从相片 JSON 解析拍摄时间（对齐 QzonePhoto getPhotoFileTime / 文件名时间源）
 *
 * 优先级：
 * 1. `exif.originalTime`
 * 2. `modifytime`（Unix 秒）
 * 3. `rawshoottime` / `shoottime`（排除 0）
 * 4. `uploadTime` / `uploadtime`
 *
 * @returns 均不可用时 None（调用方文件名用 0，且不写 mtime/EXIF）
 */
pub fn resolve_from_photo_json(item: &Value) -> Option<CaptureInstant> {
  if let Some(s) = item
    .get("exif")
    .and_then(|e| e.get("originalTime").or_else(|| e.get("original_time")))
    .and_then(value_as_time_str)
  {
    if let Some(inst) = parse_to_instant(&s) {
      return Some(inst);
    }
  }

  if let Some(n) = item.get("modifytime").or_else(|| item.get("modifyTime")) {
    if let Some(inst) = parse_json_number_time(n) {
      return Some(inst);
    }
  }

  for key in [
    "rawshoottime",
    "rawShootTime",
    "shoottime",
    "shootTime",
  ] {
    if let Some(v) = item.get(key) {
      if is_zero_time(v) {
        continue;
      }
      if let Some(inst) = parse_json_value_time(v) {
        return Some(inst);
      }
    }
  }

  for key in ["uploadTime", "uploadtime", "upload_time"] {
    if let Some(v) = item.get(key) {
      if is_zero_time(v) {
        continue;
      }
      if let Some(inst) = parse_json_value_time(v) {
        return Some(inst);
      }
    }
  }

  None
}

/// 将已存 `capture_at` 原文解析为 Unix 秒；失败返回 0（与旧命名行为一致）
pub fn unix_secs_from_stored(raw: Option<&str>) -> i64 {
  let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
    return 0;
  };
  parse_to_instant(raw)
    .map(|i| i.unix_secs)
    .unwrap_or(0)
}

fn is_zero_time(v: &Value) -> bool {
  match v {
    Value::Number(n) => n.as_i64() == Some(0) || n.as_u64() == Some(0),
    Value::String(s) => {
      let t = s.trim();
      t.is_empty() || t == "0" || t == "0.0"
    }
    _ => false,
  }
}

fn value_as_time_str(v: &Value) -> Option<String> {
  match v {
    Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
    Value::Number(n) => n
      .as_i64()
      .or_else(|| n.as_f64().map(|f| f as i64))
      .map(|n| n.to_string()),
    _ => None,
  }
}

fn parse_json_number_time(v: &Value) -> Option<CaptureInstant> {
  let n = v
    .as_i64()
    .or_else(|| v.as_u64().map(|u| u as i64))
    .or_else(|| v.as_f64().map(|f| f as i64))?;
  if n <= 0 {
    return None;
  }
  let secs = if n > 10_000_000_000 { n / 1000 } else { n };
  instant_from_unix(secs)
}

fn parse_json_value_time(v: &Value) -> Option<CaptureInstant> {
  if let Some(inst) = parse_json_number_time(v) {
    return Some(inst);
  }
  let s = value_as_time_str(v)?;
  parse_to_instant(&s)
}

fn parse_to_instant(raw: &str) -> Option<CaptureInstant> {
  let raw = raw.trim();
  if raw.is_empty() || raw == "0" {
    return None;
  }
  if let Ok(n) = raw.parse::<i64>() {
    if n <= 0 {
      return None;
    }
    let secs = if n > 10_000_000_000 { n / 1000 } else { n };
    return instant_from_unix(secs);
  }
  // EXIF / Qzone：`2024:01:15 12:30:45` 或已替换为 `-`
  let normalized = raw.replace('T', " ");
  let normalized = if normalized.len() >= 19
    && normalized.as_bytes().get(4) == Some(&b':')
    && normalized.as_bytes().get(7) == Some(&b':')
  {
    let mut s = normalized;
    s.replace_range(4..5, "-");
    s.replace_range(7..8, "-");
    s
  } else {
    normalized
  };
  let head = if normalized.len() >= 19 {
    &normalized[..19]
  } else {
    normalized.as_str()
  };
  if let Ok(ndt) = NaiveDateTime::parse_from_str(head, "%Y-%m-%d %H:%M:%S") {
    // 列表时间为墙钟语义，按本地解释（与资源管理器 mtime 一致）
    let dt = Local.from_local_datetime(&ndt).single()?;
    return Some(CaptureInstant {
      unix_secs: dt.timestamp(),
      display: ndt.format("%Y-%m-%d %H:%M:%S").to_string(),
    });
  }
  if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
    return instant_from_unix(dt.timestamp());
  }
  None
}

fn instant_from_unix(secs: i64) -> Option<CaptureInstant> {
  if secs <= 0 {
    return None;
  }
  let dt = Local.timestamp_opt(secs, 0).single()?;
  Some(CaptureInstant {
    unix_secs: secs,
    display: dt.format("%Y-%m-%d %H:%M:%S").to_string(),
  })
}

/// EXIF DateTime 字段格式
pub fn to_exif_datetime(unix_secs: i64) -> Option<String> {
  let dt = Local.timestamp_opt(unix_secs, 0).single()?;
  Some(dt.format("%Y:%m:%d %H:%M:%S").to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn prefers_exif_original_over_upload() {
    let item = json!({
      "exif": { "originalTime": "2020:05:01 08:09:10" },
      "uploadTime": "2024-01-01 00:00:00",
      "modifytime": 1_700_000_000
    });
    let inst = resolve_from_photo_json(&item).expect("time");
    assert_eq!(inst.display, "2020-05-01 08:09:10");
  }

  #[test]
  fn prefers_modifytime_over_shoot() {
    let item = json!({
      "modifytime": 1_700_000_000,
      "shoottime": "2020-05-01 08:09:10"
    });
    let inst = resolve_from_photo_json(&item).expect("time");
    assert_eq!(inst.unix_secs, 1_700_000_000);
  }

  #[test]
  fn skips_zero_shoot_then_upload() {
    let item = json!({
      "shoottime": 0,
      "uploadTime": "2024-03-16 21:56:48"
    });
    let inst = resolve_from_photo_json(&item).expect("time");
    assert_eq!(inst.display, "2024-03-16 21:56:48");
  }

  #[test]
  fn none_when_empty() {
    assert!(resolve_from_photo_json(&json!({})).is_none());
  }
}
