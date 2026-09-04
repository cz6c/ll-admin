//! iCloud 同步落盘命名
//! 职责：Windows 非法字符清洗；当前格式 `{unix_secs}_{id8}_{stem}.{ext}`；兼容解析旧前缀
//! 适用：下载落盘、相册 Live 配对、重复检测 content_key、一次性文件名迁移

use std::path::Path;

use chrono::{DateTime, NaiveDateTime};

use super::types::AssetPart;

/// 旧版紧凑日历前缀长度：`YYYYMMDDTHHMMSS`（迁移识别用）
const YMD_COMPACT_LEN: usize = 15;

/// Windows 文件名非法字符替换为 `_`；连续 `_` 合并为单个
pub fn sanitize_filename(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
  let mut prev_underscore = false;
  for c in input.chars() {
    let ch = if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
      '_'
    } else {
      c
    };
    if ch == '_' {
      if !prev_underscore {
        out.push('_');
        prev_underscore = true;
      }
    } else {
      out.push(ch);
      prev_underscore = false;
    }
  }
  out
}

/// asset_id 的稳定 8 位 hex 短码，写入同步文件名便于扫盘反查
pub fn asset_id_token(asset_id: &str) -> String {
  const FNV_OFFSET: u64 = 0xcbf29ce484222325;
  const FNV_PRIME: u64 = 0x100000001b3;
  let mut hash = FNV_OFFSET;
  for b in asset_id.as_bytes() {
    hash ^= *b as u64;
    hash = hash.wrapping_mul(FNV_PRIME);
  }
  format!("{:08x}", (hash & 0xffff_ffff) as u32)
}

/**
 * 将 catalog `capture_at` 压成 Unix 秒（十进制字符串），供文件名字典序 ≈ 拍摄序
 * @note 缺省或无法解析时用 `0`，仍靠 id8 保证文件名唯一
 */
pub fn compact_capture_at(raw: Option<&str>) -> String {
  let Some(s) = raw.map(str::trim).filter(|x| !x.is_empty()) else {
    return "0".into();
  };
  if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
    return dt.timestamp().max(0).to_string();
  }
  for fmt in [
    "%Y-%m-%dT%H:%M:%S%.fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
  ] {
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, fmt) {
      return naive.and_utc().timestamp().max(0).to_string();
    }
  }
  "0".into()
}

fn filename_stem_ext(filename: &str) -> (String, String) {
  let path = Path::new(filename);
  let stem = path
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("asset")
    .to_string();
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("bin")
    .to_string();
  (stem, ext)
}

/// 生成当前落盘文件名：`{unix_secs}_{id8}_{sanitized_stem}.{ext}`
pub fn format_asset_filename(
  capture_at: Option<&str>,
  asset_id: &str,
  stem: &str,
  ext: &str,
) -> String {
  let stem = sanitize_filename(stem);
  let ext = ext.trim_start_matches('.');
  let id8 = asset_id_token(asset_id);
  let capture = compact_capture_at(capture_at);
  format!("{capture}_{id8}_{stem}.{ext}")
}

/// 由 catalog 字段计算同步落盘文件名（不含目录）
pub fn sync_asset_filename(
  capture_at: Option<&str>,
  asset_id: &str,
  original_filename: &str,
  part: AssetPart,
) -> String {
  let (stem, ext) = filename_stem_ext(original_filename);
  let ext = match part {
    AssetPart::Mov => "mov".to_string(),
    _ => ext,
  };
  format_asset_filename(capture_at, asset_id, &stem, &ext)
}

/// 当前格式：9–12 位十进制 Unix 秒（排除旧五位 index）
fn stem_has_unix_epoch_prefix(stem: &str) -> bool {
  let Some((prefix, _)) = stem.split_once('_') else {
    return false;
  };
  let len = prefix.len();
  (9..=12).contains(&len) && prefix.chars().all(|c| c.is_ascii_digit())
}

/// 过渡格式：`YYYYMMDDTHHMMSS_`（曾用日历紧凑串）
fn stem_has_ymd_compact_prefix(stem: &str) -> bool {
  if stem.len() < YMD_COMPACT_LEN + 1 {
    return false;
  }
  let bytes = stem.as_bytes();
  if bytes.get(YMD_COMPACT_LEN) != Some(&b'_') {
    return false;
  }
  let t = bytes.get(8).copied();
  if t != Some(b'T') && t != Some(b't') {
    return false;
  }
  stem[..8].chars().all(|c| c.is_ascii_digit())
    && stem[9..YMD_COMPACT_LEN].chars().all(|c| c.is_ascii_digit())
}

/// 旧版五位 `index_`（排除 unix / ymd）
fn stem_has_index_prefix(stem: &str) -> bool {
  if stem_has_unix_epoch_prefix(stem) || stem_has_ymd_compact_prefix(stem) {
    return false;
  }
  stem.len() >= 6
    && stem.as_bytes().get(5) == Some(&b'_')
    && stem[..5].chars().all(|c| c.is_ascii_digit())
}

fn id8_token(s: &str) -> Option<&str> {
  if s.len() == 8 && s.bytes().all(|b| b.is_ascii_hexdigit()) {
    Some(s)
  } else {
    None
  }
}

/// 去掉时间/序号前缀后的剩余 stem（可能仍含 id8_）
fn after_time_prefix<'a>(stem: &'a str) -> Option<&'a str> {
  if stem_has_unix_epoch_prefix(stem) {
    let (_, rest) = stem.split_once('_')?;
    return Some(rest);
  }
  if stem_has_ymd_compact_prefix(stem) {
    return Some(&stem[YMD_COMPACT_LEN + 1..]);
  }
  if stem_has_index_prefix(stem) {
    return Some(&stem[6..]);
  }
  None
}

/// 当前落盘格式（unix 秒 + id8）
pub fn is_capture_sync_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_unix_epoch_prefix(stem) {
    return false;
  }
  let Some(rest) = after_time_prefix(stem) else {
    return false;
  };
  let Some((token, _)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some()
}

/// 旧版应用同步：`{index:05}_{id8}_{stem}`
pub fn is_index_id8_sync_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_index_prefix(stem) {
    return false;
  }
  let rest = &stem[6..];
  let Some((token, _)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some()
}

/// 过渡：`{YYYYMMDDTHHMMSS}_{id8}_…`
fn is_ymd_id8_sync_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename).file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  if !stem_has_ymd_compact_prefix(stem) {
    return false;
  }
  let rest = &stem[YMD_COMPACT_LEN + 1..];
  let Some((token, _)) = rest.split_once('_') else {
    return false;
  };
  id8_token(token).is_some()
}

/// 应用同步落盘（含当前 unix、过渡 ymd、旧 index+id8）
pub fn is_new_format_sync_filename(filename: &str) -> bool {
  sync_id8_from_filename(filename).is_some()
}

/// 旧 icloudpd / 早期同步：仅 `{index:05}_{stem}`，无 id8
pub fn is_legacy_sync_filename(filename: &str) -> bool {
  sync_index_from_filename(filename).is_some() && !is_index_id8_sync_filename(filename)
}

/// 是否仍需迁到当前 unix 秒格式
pub fn needs_capture_format_migration(filename: &str) -> bool {
  !is_capture_sync_filename(filename)
    && (is_index_id8_sync_filename(filename)
      || is_ymd_id8_sync_filename(filename)
      || is_legacy_sync_filename(filename))
}

/// 从同步落盘 basename 解析 id8（unix / ymd / index+id8）
pub fn sync_id8_from_filename(filename: &str) -> Option<String> {
  let stem = Path::new(filename)
    .file_stem()
    .and_then(|s| s.to_str())?;
  let rest = after_time_prefix(stem)?;
  let (token, _) = rest.split_once('_')?;
  id8_token(token).map(|t| t.to_ascii_lowercase())
}

/// 从旧五位序号文件名解析 index；unix/ymd 格式返回 None
pub fn sync_index_from_filename(filename: &str) -> Option<u32> {
  let stem = Path::new(filename)
    .file_stem()
    .and_then(|s| s.to_str())?;
  if !stem_has_index_prefix(stem) {
    return None;
  }
  stem[..5].parse().ok()
}

/// 去掉同步落盘 stem 上的时间/序号与可选 id8，供重复检测 content_key
pub fn strip_sync_filename_stem_prefix(stem: &str) -> String {
  let lower = stem.to_lowercase();
  let Some(rest) = after_time_prefix(&lower) else {
    return lower;
  };
  if let Some((token, after)) = rest.split_once('_') {
    if id8_token(token).is_some() {
      return after.to_string();
    }
  }
  rest.to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_strips_windows_illegal() {
    assert_eq!(sanitize_filename("a<b>:c"), "a_b_c");
  }

  #[test]
  fn compact_capture_is_unix_secs() {
    assert_eq!(
      compact_capture_at(Some("2024-01-15T12:30:45Z")),
      "1705321845"
    );
  }

  #[test]
  fn format_uses_unix_and_id8() {
    let name = format_asset_filename(Some("2024-01-15T12:30:45Z"), "asset-uuid-1", "x", "jpg");
    assert!(name.starts_with("1705321845_"));
    assert!(name.ends_with("_x.jpg"));
    let id8 = asset_id_token("asset-uuid-1");
    assert!(name.contains(&format!("_{id8}_")));
  }

  #[test]
  fn detect_unix_vs_ymd_vs_index() {
    let id8 = asset_id_token("A1");
    let unix = format!("1705321845_{id8}_IMG_0027.HEIC");
    let ymd = format!("20240115T120000_{id8}_IMG_0027.HEIC");
    let index_id8 = format!("00042_{id8}_IMG_0027.HEIC");

    assert!(is_capture_sync_filename(&unix));
    assert!(!needs_capture_format_migration(&unix));

    assert!(is_ymd_id8_sync_filename(&ymd));
    assert!(needs_capture_format_migration(&ymd));

    assert!(is_index_id8_sync_filename(&index_id8));
    assert!(needs_capture_format_migration(&index_id8));
    assert!(is_legacy_sync_filename("00042_IMG_0027.HEIC"));
    assert_eq!(sync_index_from_filename(&unix), None);
    assert_eq!(sync_index_from_filename(&index_id8), Some(42));
  }

  #[test]
  fn strip_handles_unix_ymd_and_index() {
    let id8 = asset_id_token("A1");
    assert_eq!(
      strip_sync_filename_stem_prefix(&format!("1705321845_{id8}_img_0027")),
      "img_0027"
    );
    assert_eq!(
      strip_sync_filename_stem_prefix(&format!("20240115T120000_{id8}_img_0027")),
      "img_0027"
    );
    assert_eq!(
      strip_sync_filename_stem_prefix(&format!("00042_{id8}_img_0027")),
      "img_0027"
    );
    assert_eq!(
      strip_sync_filename_stem_prefix("00042_img_0027"),
      "img_0027"
    );
  }

  #[test]
  fn sync_id8_from_all_app_formats() {
    let id8 = asset_id_token("A1");
    assert_eq!(
      sync_id8_from_filename(&format!("1705321845_{id8}_IMG.HEIC")).as_deref(),
      Some(id8.as_str())
    );
    assert_eq!(
      sync_id8_from_filename(&format!("20240115T120000_{id8}_IMG.HEIC")).as_deref(),
      Some(id8.as_str())
    );
    assert_eq!(
      sync_id8_from_filename(&format!("00001_{id8}_IMG.HEIC")).as_deref(),
      Some(id8.as_str())
    );
  }
}
