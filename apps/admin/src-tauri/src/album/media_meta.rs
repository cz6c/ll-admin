//! 相册媒体元数据（拍摄时间 / 机型）
//! 职责：下载入库与缩略图后回填共用同一套解析；**不写尺寸**
//! 优先级：调用方本表仅补空；建议值 = 可选 origin → EXIF → 同步文件名前缀 `yyyyMMdd_HHmmss`
//! @note 不再反查 sync state.db；云端时间仅下载时经 origin 一次性写入本表
//! 适用：sync ingress / thumbnail pipeline

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use chrono::{Local, NaiveDateTime, TimeZone};
use exif::{In, Reader, Tag};

/// 单次解析结果；调用方按「仅补空」写 capture/camera，并总是写探测/锁定
#[derive(Debug, Clone, Default)]
pub struct MediaMetaFill {
  /// 建议写入的拍摄时间
  pub capture_at: Option<String>,
  /// `origin` / `exif` / `filename`
  pub capture_at_source: Option<String>,
  pub camera: Option<String>,
  /// 能提供拍摄时间 → 禁止用户手改
  pub capture_at_locked: bool,
}

/**
 * 统一解析拍摄时间与机型
 * @param origin_capture_at 下载入库时传入云端 catalog 时间；回填传 None
 */
pub fn resolve_capture_meta(
  path: &str,
  origin_capture_at: Option<&str>,
) -> MediaMetaFill {
  let exif = read_exif_bundle(Path::new(path));

  let (capture_at, capture_at_source) =
    if let Some(raw) = origin_capture_at.map(str::trim).filter(|s| !s.is_empty()) {
      (
        Some(normalize_origin_capture(raw)),
        Some("origin".to_string()),
      )
    } else if let Some(at) = exif.capture_at.clone() {
      (Some(at), Some("exif".to_string()))
    } else if let Some(at) = parse_capture_at_from_sync_filename(path) {
      (Some(at), Some("filename".to_string()))
    } else {
      (None, None)
    };

  MediaMetaFill {
    capture_at_locked: capture_at.is_some(),
    capture_at,
    capture_at_source,
    camera: exif.camera,
  }
}

fn normalize_origin_capture(raw: &str) -> String {
  let s = raw.trim();
  if let Some(norm) = normalize_exif_datetime(s) {
    return norm;
  }
  if s.len() >= 19 && s.as_bytes().get(10) == Some(&b' ') {
    let mut out = s[..19].to_string();
    out.replace_range(10..11, "T");
    return out;
  }
  s.to_string()
}

/**
 * 从同步落盘文件名解析拍摄时间（`yyyyMMdd_HHmmss_{id16}`）
 * @note 等于 epoch 占位前缀时视为无效
 */
pub fn parse_capture_at_from_sync_filename(path_or_name: &str) -> Option<String> {
  let base = Path::new(path_or_name)
    .file_name()
    .and_then(|s| s.to_str())?;
  let stem = Path::new(base).file_stem()?.to_str()?;
  let parts: Vec<&str> = stem.split('_').collect();
  let [ymd, hms, id16] = parts.as_slice() else {
    return None;
  };
  if ymd.len() != 8 || !ymd.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }
  if hms.len() != 6 || !hms.bytes().all(|b| b.is_ascii_digit()) {
    return None;
  }
  if id16.len() != 16
    || !id16.bytes().all(|b| {
      b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || (b'A'..=b'F').contains(&b)
    })
  {
    return None;
  }
  let prefix = format!("{ymd}_{hms}");
  let epoch_prefix = Local
    .timestamp_opt(0, 0)
    .single()
    .map(|dt| dt.format("%Y%m%d_%H%M%S").to_string())
    .unwrap_or_else(|| "19700101_000000".into());
  if prefix == epoch_prefix {
    return None;
  }
  let naive = NaiveDateTime::parse_from_str(&format!("{ymd}{hms}"), "%Y%m%d%H%M%S").ok()?;
  Some(naive.format("%Y-%m-%dT%H:%M:%S").to_string())
}

struct ExifBundle {
  capture_at: Option<String>,
  camera: Option<String>,
}

fn read_exif_bundle(path: &Path) -> ExifBundle {
  let empty = ExifBundle {
    capture_at: None,
    camera: None,
  };
  let file = match File::open(path) {
    Ok(f) => f,
    Err(_) => return empty,
  };
  let mut reader = BufReader::new(file);
  let exif = match Reader::new().read_from_container(&mut reader) {
    Ok(e) => e,
    Err(_) => return empty,
  };

  let capture_at = exif
    .get_field(Tag::DateTimeOriginal, In::PRIMARY)
    .or_else(|| exif.get_field(Tag::DateTimeDigitized, In::PRIMARY))
    .or_else(|| exif.get_field(Tag::DateTime, In::PRIMARY))
    .and_then(|f| normalize_exif_datetime(&f.display_value().to_string()));

  let make = exif
    .get_field(Tag::Make, In::PRIMARY)
    .map(|f| f.display_value().to_string())
    .map(|s| s.trim().trim_matches('"').to_string())
    .filter(|s| !s.is_empty());
  let model = exif
    .get_field(Tag::Model, In::PRIMARY)
    .map(|f| f.display_value().to_string())
    .map(|s| s.trim().trim_matches('"').to_string())
    .filter(|s| !s.is_empty());
  let camera = format_camera(make.as_deref(), model.as_deref());

  ExifBundle {
    capture_at,
    camera,
  }
}

fn format_camera(make: Option<&str>, model: Option<&str>) -> Option<String> {
  let make = make.map(str::trim).filter(|s| !s.is_empty());
  let model = model.map(str::trim).filter(|s| !s.is_empty());
  match (make, model) {
    (None, None) => None,
    (Some(m), None) => Some(m.to_string()),
    (None, Some(model)) => Some(model.to_string()),
    (Some(make), Some(model)) => {
      if model.to_lowercase().starts_with(&make.to_lowercase()) {
        Some(model.to_string())
      } else {
        Some(format!("{make} {model}"))
      }
    }
  }
}

fn normalize_exif_datetime(raw: &str) -> Option<String> {
  let s = raw.trim().trim_matches('"');
  if s.len() < 19 {
    return None;
  }
  let bytes = s.as_bytes();
  if bytes[4] == b':'
    && bytes[7] == b':'
    && bytes[10] == b' '
    && bytes[13] == b':'
    && bytes[16] == b':'
  {
    let mut out = s[..19].to_string();
    out.replace_range(4..5, "-");
    out.replace_range(7..8, "-");
    out.replace_range(10..11, "T");
    return Some(out);
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_filename_prefix() {
    let name = "20240115_123045_0123456789abcdef.jpg";
    assert_eq!(
      parse_capture_at_from_sync_filename(name).as_deref(),
      Some("2024-01-15T12:30:45")
    );
  }

  #[test]
  fn reject_epoch_placeholder_filename() {
    let prefix = Local
      .timestamp_opt(0, 0)
      .single()
      .unwrap()
      .format("%Y%m%d_%H%M%S");
    let name = format!("{prefix}_0123456789abcdef.jpg");
    assert_eq!(parse_capture_at_from_sync_filename(&name), None);
  }

  #[test]
  fn ingress_prefers_origin_over_filename() {
    let fill = resolve_capture_meta(
      "20240115_123045_0123456789abcdef.jpg",
      Some("2020-05-01 08:00:00"),
    );
    assert_eq!(fill.capture_at_source.as_deref(), Some("origin"));
    assert!(fill.capture_at.as_deref().unwrap().starts_with("2020-05-01"));
  }
}
