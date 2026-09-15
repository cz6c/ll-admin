//! iCloud 同步落盘命名（当前唯一格式）
//! 职责：`{yyyyMMdd}_{HHmmss}_{id16}.{ext}`；换号隔离靠目录 `iCloudSync/<AppleID>/`
//! 适用：下载落盘；相册扫描识别同步产物 vs 异物（移入 pending）
//! @note 仍认旧名 `{unix}` / `{unix}_{apple8}_{id16}`，避免迁移前被扫进 pending；时间用本地时区

use std::path::Path;

use chrono::{DateTime, Local, NaiveDateTime, TimeZone};

use super::types::AssetPart;

fn is_lower_hex(s: &str, len: usize) -> bool {
  s.len() == len
    && s.bytes()
      .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || (b'A'..=b'F').contains(&b))
}

fn secs_ok(secs: &str) -> bool {
  !secs.is_empty() && secs.bytes().all(|b| b.is_ascii_digit())
}

fn ymd_ok(s: &str) -> bool {
  s.len() == 8 && s.bytes().all(|b| b.is_ascii_digit())
}

fn hms_ok(s: &str) -> bool {
  s.len() == 6 && s.bytes().all(|b| b.is_ascii_digit())
}

/// 本地时区把 Unix 秒格式化为 `yyyyMMdd_HHmmss`
pub fn format_capture_prefix(unix_secs: i64) -> String {
  let secs = unix_secs.max(0);
  Local
    .timestamp_opt(secs, 0)
    .single()
    .unwrap_or_else(|| Local.timestamp_opt(0, 0).single().expect("unix epoch"))
    .format("%Y%m%d_%H%M%S")
    .to_string()
}

/// 新：`yyyyMMdd_HHmmss_id16`；旧：`secs_id16` / `secs_apple8_id16`
fn is_sync_asset_stem(stem: &str) -> bool {
  let parts: Vec<&str> = stem.split('_').collect();
  match parts.as_slice() {
    [ymd, hms, id16] if ymd_ok(ymd) && hms_ok(hms) && is_lower_hex(id16, 16) => true,
    [secs, id16] if secs_ok(secs) && is_lower_hex(id16, 16) => true,
    [secs, apple8, id16]
      if secs_ok(secs) && is_lower_hex(apple8, 8) && is_lower_hex(id16, 16) =>
    {
      true
    }
    _ => false,
  }
}

/**
 * 是否为当前同步落盘命名（仅文件名，不含目录；含旧格式）
 * @note 相册扫描用：不合规媒体可移入 `{output_dir}/pending/`
 */
pub fn is_sync_asset_filename(filename: &str) -> bool {
  let name = filename.trim();
  if name.is_empty() {
    return false;
  }
  let base = Path::new(name)
    .file_name()
    .and_then(|s| s.to_str())
    .unwrap_or(name);
  let path = Path::new(base);
  let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
    return false;
  };
  let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
    return false;
  };
  if ext.is_empty() || ext.contains('/') || ext.contains('\\') {
    return false;
  }
  is_sync_asset_stem(stem)
}

fn fnv1a64(bytes: &[u8]) -> u64 {
  const FNV_OFFSET: u64 = 0xcbf29ce484222325;
  const FNV_PRIME: u64 = 0x100000001b3;
  let mut hash = FNV_OFFSET;
  for b in bytes {
    hash ^= *b as u64;
    hash = hash.wrapping_mul(FNV_PRIME);
  }
  hash
}

/// Apple ID 稳定 8 位 hex（仅测试/历史兼容识别用）
#[cfg(test)]
pub fn apple_id_token(apple_id: &str) -> String {
  format!("{:08x}", (fnv1a64(apple_id.as_bytes()) & 0xffff_ffff) as u32)
}

/// asset_id 稳定 16 位 hex（FNV-1a 全 64 位）
pub fn asset_id_token16(asset_id: &str) -> String {
  format!("{:016x}", fnv1a64(asset_id.as_bytes()))
}

/**
 * 将 catalog `capture_at` 压成 `yyyyMMdd_HHmmss`（本地时区 / 无偏移则按字面钟面）
 * @note 缺省或无法解析时用 epoch 本地钟面
 */
pub fn compact_capture_at(raw: Option<&str>) -> String {
  let Some(s) = raw.map(str::trim).filter(|x| !x.is_empty()) else {
    return format_capture_prefix(0);
  };
  if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
    return dt
      .with_timezone(&Local)
      .format("%Y%m%d_%H%M%S")
      .to_string();
  }
  for fmt in [
    "%Y-%m-%dT%H:%M:%S%.fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
  ] {
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, fmt) {
      return naive.format("%Y%m%d_%H%M%S").to_string();
    }
  }
  format_capture_prefix(0)
}

fn filename_ext(filename: &str) -> String {
  Path::new(filename)
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("bin")
    .to_string()
}

/// Apple ID 邮箱作子目录名（路径非法字符替换为 `_`）
pub fn account_dir_name(apple_id: &str) -> String {
  let s = apple_id.trim();
  let mut out = String::with_capacity(s.len());
  for c in s.chars() {
    if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
      out.push('_');
    } else {
      out.push(c);
    }
  }
  if out.is_empty() {
    "_unknown".into()
  } else {
    out
  }
}

/// 生成落盘文件名：`{yyyyMMdd}_{HHmmss}_{id16}.{ext}`（无原始 stem、无账号段）
pub fn format_asset_filename(capture_at: Option<&str>, asset_id: &str, ext: &str) -> String {
  let ext = ext.trim_start_matches('.');
  let capture = compact_capture_at(capture_at);
  let id16 = asset_id_token16(asset_id);
  format!("{capture}_{id16}.{ext}")
}

/// 由 catalog 字段计算同步落盘文件名（不含目录）
pub fn sync_asset_filename(
  capture_at: Option<&str>,
  asset_id: &str,
  original_filename: &str,
  part: AssetPart,
) -> String {
  let ext = match part {
    AssetPart::Mov => "mov".to_string(),
    _ => filename_ext(original_filename),
  };
  format_asset_filename(capture_at, asset_id, &ext)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn compact_capture_is_local_ymd_hms() {
    let got = compact_capture_at(Some("2024-01-15T12:30:45Z"));
    let expect = DateTime::parse_from_rfc3339("2024-01-15T12:30:45Z")
      .unwrap()
      .with_timezone(&Local)
      .format("%Y%m%d_%H%M%S")
      .to_string();
    assert_eq!(got, expect);
    assert_eq!(
      compact_capture_at(Some("2024-01-15 12:30:45")),
      "20240115_123045"
    );
  }

  #[test]
  fn format_is_ymd_hms_id16_no_apple8() {
    let name = format_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "asset-uuid-1",
      "jpg",
    );
    let id16 = asset_id_token16("asset-uuid-1");
    let prefix = compact_capture_at(Some("2024-01-15T12:30:45Z"));
    assert_eq!(name, format!("{prefix}_{id16}.jpg"));
  }

  #[test]
  fn mov_part_forces_mov_ext() {
    let name = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "L1",
      "IMG_1.HEIC",
      AssetPart::Mov,
    );
    assert!(name.ends_with(".mov"));
  }

  #[test]
  fn is_sync_asset_filename_accepts_new_and_legacy() {
    let name = format_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "asset-uuid-1",
      "heic",
    );
    assert!(is_sync_asset_filename(&name));
    let apple8 = apple_id_token("user@icloud.com");
    let id16 = asset_id_token16("asset-uuid-1");
    let legacy3 = format!("1705321845_{apple8}_{id16}.heic");
    let legacy2 = format!("1705321845_{id16}.heic");
    assert!(is_sync_asset_filename(&legacy3));
    assert!(is_sync_asset_filename(&legacy2));
  }

  #[test]
  fn is_sync_asset_filename_rejects_orphan() {
    assert!(!is_sync_asset_filename("IMG_1234.HEIC"));
    assert!(!is_sync_asset_filename("1705321845_short_id.heic"));
    assert!(!is_sync_asset_filename(""));
  }

  #[test]
  fn account_dir_keeps_email_at() {
    assert_eq!(account_dir_name("a@b.com"), "a@b.com");
    assert_eq!(account_dir_name("a:b"), "a_b");
  }
}
