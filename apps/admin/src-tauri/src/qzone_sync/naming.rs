//! QQ 空间同步落盘命名
//! 职责：`{unix_secs}_{uin8}_{id16}.{ext}`；换号靠 uin8 隔离
//! 适用：下载落盘；相册扫描识别同步产物 vs 异物

use std::path::Path;

fn is_lower_hex(s: &str, len: usize) -> bool {
  s.len() == len
    && s.bytes()
      .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || (b'A'..=b'F').contains(&b))
}

fn is_sync_asset_stem(stem: &str) -> bool {
  let mut parts = stem.split('_');
  let (Some(secs), Some(uin8), Some(id16), None) =
    (parts.next(), parts.next(), parts.next(), parts.next())
  else {
    return false;
  };
  if secs.is_empty() || !secs.bytes().all(|b| b.is_ascii_digit()) {
    return false;
  }
  is_lower_hex(uin8, 8) && is_lower_hex(id16, 16)
}

/// 是否为本源落盘命名（仅文件名）
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

/// QQ 号稳定 8 位 hex
pub fn uin_token(uin: &str) -> String {
  format!("{:08x}", (fnv1a64(uin.as_bytes()) & 0xffff_ffff) as u32)
}

/// 媒体 id 稳定 16 位 hex
pub fn asset_id_token16(asset_id: &str) -> String {
  format!("{:016x}", fnv1a64(asset_id.as_bytes()))
}

/// 生成落盘文件名（无目录）
pub fn build_filename(unix_secs: i64, uin: &str, asset_id: &str, ext: &str) -> String {
  let secs = if unix_secs < 0 { 0 } else { unix_secs as u64 };
  let ext = ext.trim_start_matches('.').to_ascii_lowercase();
  format!(
    "{secs}_{}_{}.{}",
    uin_token(uin),
    asset_id_token16(asset_id),
    if ext.is_empty() { "bin" } else { &ext }
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn roundtrip_filename_shape() {
    let name = build_filename(1_700_000_000, "123456", "photo-abc", "jpg");
    assert!(is_sync_asset_filename(&name));
    assert!(!is_sync_asset_filename("random.jpg"));
  }
}
