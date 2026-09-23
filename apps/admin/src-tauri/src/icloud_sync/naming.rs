//! iCloud 同步落盘命名（当前唯一格式）
//! 职责：在共享谓词之上组装 `{yyyyMMdd}_{HHmmss}_{id16}.{ext}`；换号隔离靠目录
//! 适用：下载落盘；相册扫描识别同步产物 vs 异物（移入 pending）
//! @note stem / token / 子目录消毒见 `crate::sync_common::naming`

use std::path::Path;

use chrono::{DateTime, Local, NaiveDateTime};

use crate::sync_common::naming::format_capture_prefix;

pub use crate::sync_common::naming::{account_dir_name, asset_id_token16, is_sync_asset_filename};

use super::types::AssetPart;

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

/// Apple ID 稳定 8 位 hex（仅测试/历史兼容识别用）
#[cfg(test)]
pub fn apple_id_token(apple_id: &str) -> String {
  crate::sync_common::naming::account_token8(apple_id)
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
    let name = format_asset_filename(Some("2024-01-15T12:30:45Z"), "asset-uuid-1", "jpg");
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
    let name = format_asset_filename(Some("2024-01-15T12:30:45Z"), "asset-uuid-1", "heic");
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
