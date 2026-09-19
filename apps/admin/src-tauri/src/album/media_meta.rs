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

/// 单次解析结果；调用方按「仅补空」写 capture/camera，并总是写 probed
#[derive(Debug, Clone, Default)]
pub struct MediaMetaFill {
  /// 建议写入的拍摄时间
  pub capture_at: Option<String>,
  /// `origin` / `exif` / `filename`
  pub capture_at_source: Option<String>,
  pub camera: Option<String>,
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

fn is_hex_token(s: &str, len: usize) -> bool {
  s.len() == len
    && s.bytes().all(|b| {
      b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || (b'A'..=b'F').contains(&b)
    })
}

fn is_digit_token(s: &str, len: Option<usize>) -> bool {
  !s.is_empty()
    && len.map(|n| s.len() == n).unwrap_or(true)
    && s.bytes().all(|b| b.is_ascii_digit())
}

/// 从同步风格 stem 取出稳定 id16（新 `ymd_hms_id16` / 旧 `secs_id16` / `secs_mid8_id16`）
fn sync_stem_id16(stem: &str) -> Option<&str> {
  let parts: Vec<&str> = stem.split('_').collect();
  match parts.as_slice() {
    [ymd, hms, id16]
      if is_digit_token(ymd, Some(8)) && is_digit_token(hms, Some(6)) && is_hex_token(id16, 16) =>
    {
      Some(*id16)
    }
    [secs, id16] if is_digit_token(secs, None) && is_hex_token(id16, 16) => Some(*id16),
    [secs, mid8, id16]
      if is_digit_token(secs, None) && is_hex_token(mid8, 8) && is_hex_token(id16, 16) =>
    {
      Some(*id16)
    }
    _ => None,
  }
}

/// 本地时区把 Unix 秒格式化为同步文件名前缀 `yyyyMMdd_HHmmss`
pub fn format_capture_filename_prefix(unix_secs: i64) -> String {
  let secs = unix_secs.max(0);
  Local
    .timestamp_opt(secs, 0)
    .single()
    .unwrap_or_else(|| Local.timestamp_opt(0, 0).single().expect("unix epoch"))
    .format("%Y%m%d_%H%M%S")
    .to_string()
}

/**
 * 同步风格文件名按新拍摄时间改前缀；保留 id16 与扩展名
 * @returns 新绝对路径；非同步风格或无法解析时 None（仅改库、不改名）
 */
pub fn path_with_rewritten_capture_prefix(path: &Path, unix_secs: i64) -> Option<std::path::PathBuf> {
  let stem = path.file_stem()?.to_str()?;
  let ext = path.extension()?.to_str()?;
  let id16 = sync_stem_id16(stem)?;
  let prefix = format_capture_filename_prefix(unix_secs);
  let new_name = format!("{prefix}_{id16}.{ext}");
  Some(path.with_file_name(new_name))
}

/**
 * 从同步落盘文件名解析拍摄时间（`yyyyMMdd_HHmmss_{id16}`）
 * @note 等于 epoch 占位前缀时视为无效；旧 unix 前缀不在此解析
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
  if !is_digit_token(ymd, Some(8)) || !is_digit_token(hms, Some(6)) || !is_hex_token(id16, 16) {
    return None;
  }
  let prefix = format!("{ymd}_{hms}");
  let epoch_prefix = format_capture_filename_prefix(0);
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
    let prefix = format_capture_filename_prefix(0);
    let name = format!("{prefix}_0123456789abcdef.jpg");
    assert_eq!(parse_capture_at_from_sync_filename(&name), None);
  }

  #[test]
  fn rewrite_sync_filename_prefix_keeps_id16() {
    let old = Path::new(r"D:\a\20240115_123045_0123456789abcdef.jpg");
    let next = path_with_rewritten_capture_prefix(old, 1_705_321_845).unwrap();
    let name = next.file_name().unwrap().to_str().unwrap();
    assert!(name.ends_with("_0123456789abcdef.jpg"));
    assert_eq!(name.len(), "20240115_123045_0123456789abcdef.jpg".len());
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
