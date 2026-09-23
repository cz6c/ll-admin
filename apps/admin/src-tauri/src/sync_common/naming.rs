//! 同步落盘命名谓词与 token
//! 职责：`{yyyyMMdd}_{HHmmss}_{id16}.{ext}`（及旧 unix 格式）识别；账号子目录消毒
//! 适用：iCloud / QQ 两源共用；各源仅保留自己的 filename 组装

use std::path::Path;

use chrono::{Local, TimeZone};

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

/// 新：`yyyyMMdd_HHmmss_id16`；旧：`secs_id16` / `secs_account8_id16`
fn is_sync_asset_stem(stem: &str) -> bool {
  let parts: Vec<&str> = stem.split('_').collect();
  match parts.as_slice() {
    [ymd, hms, id16] if ymd_ok(ymd) && hms_ok(hms) && is_lower_hex(id16, 16) => true,
    [secs, id16] if secs_ok(secs) && is_lower_hex(id16, 16) => true,
    [secs, account8, id16]
      if secs_ok(secs) && is_lower_hex(account8, 8) && is_lower_hex(id16, 16) =>
    {
      true
    }
    _ => false,
  }
}

/**
 * 是否为同步落盘命名（仅文件名，不含目录；含旧格式）
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

/// 媒体 / asset id 稳定 16 位 hex（FNV-1a 全 64 位）
pub fn asset_id_token16(asset_id: &str) -> String {
  format!("{:016x}", fnv1a64(asset_id.as_bytes()))
}

/// 账号串作子目录名（路径非法字符替换为 `_`）
pub fn account_dir_name(raw: &str) -> String {
  let s = raw.trim();
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

/// 账号稳定 8 位 hex（仅测试 / 历史兼容识别用）
#[cfg(test)]
pub fn account_token8(raw: &str) -> String {
  format!("{:08x}", (fnv1a64(raw.as_bytes()) & 0xffff_ffff) as u32)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_new_and_legacy_stems() {
    let id16 = asset_id_token16("asset-1");
    let prefix = format_capture_prefix(1_705_321_845);
    let neu = format!("{prefix}_{id16}.heic");
    assert!(is_sync_asset_filename(&neu));
    let account8 = account_token8("user@icloud.com");
    assert!(is_sync_asset_filename(&format!(
      "1705321845_{account8}_{id16}.heic"
    )));
    assert!(is_sync_asset_filename(&format!("1705321845_{id16}.heic")));
    assert!(!is_sync_asset_filename("IMG_1234.HEIC"));
  }

  #[test]
  fn account_dir_keeps_email_at() {
    assert_eq!(account_dir_name("a@b.com"), "a@b.com");
    assert_eq!(account_dir_name("a:b"), "a_b");
  }
}
