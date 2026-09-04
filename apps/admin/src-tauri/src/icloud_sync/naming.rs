//! iCloud 同步落盘命名（当前唯一格式）
//! 职责：生成 `{unix_secs}_{apple8}_{id16}.{ext}`；换号同目录靠 apple8 隔离
//! 适用：下载落盘；相册 Live 按完整 stem 配对（本模块不解析旧名）

use std::path::Path;

use chrono::{DateTime, NaiveDateTime};

use super::types::AssetPart;

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

/// Apple ID 稳定 8 位 hex，写入文件名做换号同目录隔离（非明文邮箱）
pub fn apple_id_token(apple_id: &str) -> String {
  format!("{:08x}", (fnv1a64(apple_id.as_bytes()) & 0xffff_ffff) as u32)
}

/// asset_id 稳定 16 位 hex（FNV-1a 全 64 位）
pub fn asset_id_token16(asset_id: &str) -> String {
  format!("{:016x}", fnv1a64(asset_id.as_bytes()))
}

/**
 * 将 catalog `capture_at` 压成 Unix 秒（十进制字符串），供文件名字典序 ≈ 拍摄序
 * @note 缺省或无法解析时用 `0`，仍靠 apple8+id16 保证文件名唯一
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

fn filename_ext(filename: &str) -> String {
  Path::new(filename)
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("bin")
    .to_string()
}

/// 生成落盘文件名：`{unix_secs}_{apple8}_{id16}.{ext}`（无原始 stem）
pub fn format_asset_filename(
  capture_at: Option<&str>,
  apple_id: &str,
  asset_id: &str,
  ext: &str,
) -> String {
  let ext = ext.trim_start_matches('.');
  let capture = compact_capture_at(capture_at);
  let apple8 = apple_id_token(apple_id);
  let id16 = asset_id_token16(asset_id);
  format!("{capture}_{apple8}_{id16}.{ext}")
}

/// 由 catalog 字段计算同步落盘文件名（不含目录）
pub fn sync_asset_filename(
  capture_at: Option<&str>,
  apple_id: &str,
  asset_id: &str,
  original_filename: &str,
  part: AssetPart,
) -> String {
  let ext = match part {
    AssetPart::Mov => "mov".to_string(),
    _ => filename_ext(original_filename),
  };
  format_asset_filename(capture_at, apple_id, asset_id, &ext)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn compact_capture_is_unix_secs() {
    assert_eq!(
      compact_capture_at(Some("2024-01-15T12:30:45Z")),
      "1705321845"
    );
  }

  #[test]
  fn format_is_unix_apple8_id16_no_stem() {
    let name = format_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "user@icloud.com",
      "asset-uuid-1",
      "jpg",
    );
    let apple8 = apple_id_token("user@icloud.com");
    let id16 = asset_id_token16("asset-uuid-1");
    assert_eq!(name, format!("1705321845_{apple8}_{id16}.jpg"));
  }

  #[test]
  fn mov_part_forces_mov_ext() {
    let name = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "a@b.com",
      "L1",
      "IMG_1.HEIC",
      AssetPart::Mov,
    );
    assert!(name.ends_with(".mov"));
  }
}
