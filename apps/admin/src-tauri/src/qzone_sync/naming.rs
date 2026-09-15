//! QQ 空间同步落盘命名
//! 职责：`{yyyyMMdd}_{HHmmss}_{id16}.{ext}`；账号隔离靠目录 `QzoneSync/<uin>/`
//! 适用：下载落盘；相册扫描识别同步产物 vs 异物
//! @note 仍认旧名 `{unix}` / `{unix}_{uin8}_{id16}`，避免迁移前被扫进 pending；时间用本地时区

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

/// 新：`yyyyMMdd_HHmmss_id16`；旧：`secs_id16` / `secs_uin8_id16`
fn is_sync_asset_stem(stem: &str) -> bool {
  let parts: Vec<&str> = stem.split('_').collect();
  match parts.as_slice() {
    [ymd, hms, id16] if ymd_ok(ymd) && hms_ok(hms) && is_lower_hex(id16, 16) => true,
    [secs, id16] if secs_ok(secs) && is_lower_hex(id16, 16) => true,
    [secs, uin8, id16]
      if secs_ok(secs) && is_lower_hex(uin8, 8) && is_lower_hex(id16, 16) =>
    {
      true
    }
    _ => false,
  }
}

/// 是否为本源落盘命名（仅文件名；含旧格式）
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

/// 媒体 id 稳定 16 位 hex
pub fn asset_id_token16(asset_id: &str) -> String {
  format!("{:016x}", fnv1a64(asset_id.as_bytes()))
}

/// QQ 号作子目录名（路径非法字符替换为 `_`）
pub fn account_dir_name(uin: &str) -> String {
  sanitize_account_dirname(uin)
}

pub(crate) fn sanitize_account_dirname(raw: &str) -> String {
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

/// 生成落盘文件名（无目录、无账号段）
pub fn build_filename(unix_secs: i64, asset_id: &str, ext: &str) -> String {
  let ext = ext.trim_start_matches('.').to_ascii_lowercase();
  format!(
    "{}_{}.{}",
    format_capture_prefix(unix_secs),
    asset_id_token16(asset_id),
    if ext.is_empty() { "bin" } else { &ext }
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn roundtrip_filename_shape() {
    let name = build_filename(1_700_000_000, "photo-abc", "jpg");
    assert!(is_sync_asset_filename(&name));
    let stem = Path::new(&name).file_stem().unwrap().to_str().unwrap();
    let parts: Vec<_> = stem.split('_').collect();
    assert_eq!(parts.len(), 3);
    assert!(ymd_ok(parts[0]));
    assert!(hms_ok(parts[1]));
    assert!(!is_sync_asset_filename("random.jpg"));
  }

  #[test]
  fn accepts_legacy_stems() {
    let legacy3 = "1700000000_abcdef01_0123456789abcdef.jpg";
    let legacy2 = "1700000000_0123456789abcdef.jpg";
    assert!(is_sync_asset_filename(legacy3));
    assert!(is_sync_asset_filename(legacy2));
  }
}
