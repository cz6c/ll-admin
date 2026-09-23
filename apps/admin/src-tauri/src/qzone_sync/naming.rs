//! QQ 空间同步落盘命名
//! 职责：在共享谓词之上组装文件名；账号隔离靠目录 `QzoneSync/<uin>/`
//! 适用：下载落盘；相册扫描识别同步产物 vs 异物
//! @note stem / token / 子目录消毒见 `crate::sync_common::naming`

use crate::sync_common::naming::format_capture_prefix;

pub use crate::sync_common::naming::{account_dir_name, asset_id_token16, is_sync_asset_filename};

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
  use std::path::Path;

  #[test]
  fn roundtrip_filename_shape() {
    let name = build_filename(1_700_000_000, "photo-abc", "jpg");
    assert!(is_sync_asset_filename(&name));
    let stem = Path::new(&name).file_stem().unwrap().to_str().unwrap();
    let parts: Vec<_> = stem.split('_').collect();
    assert_eq!(parts.len(), 3);
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
