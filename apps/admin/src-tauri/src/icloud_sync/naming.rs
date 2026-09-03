//! iCloud 同步落盘命名
//! 职责：Windows 非法字符清洗与 `{index:05d}_{id8}_{stem}.{ext}` 格式化
//! 适用：队列分配 index 后生成最终文件名；id8 便于空库扫盘反查 asset_id

use std::path::Path;

use super::types::AssetPart;

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

/// 生成落盘文件名：`{index:05d}_{id8}_{sanitized_stem}.{ext}`
pub fn format_asset_filename(index: u32, asset_id: &str, stem: &str, ext: &str) -> String {
  let stem = sanitize_filename(stem);
  let ext = ext.trim_start_matches('.');
  let id8 = asset_id_token(asset_id);
  format!("{index:05}_{id8}_{stem}.{ext}")
}

/// 由 catalog 字段计算同步落盘文件名（不含目录）
pub fn sync_asset_filename(
  index: u32,
  asset_id: &str,
  original_filename: &str,
  part: AssetPart,
) -> String {
  let (stem, ext) = filename_stem_ext(original_filename);
  let ext = match part {
    AssetPart::Mov => "mov".to_string(),
    _ => ext,
  };
  format_asset_filename(index, asset_id, &stem, &ext)
}

/// 同步落盘 basename 是否含 `{index}_{id8}_` 新格式
pub fn is_new_format_sync_filename(filename: &str) -> bool {
  let Some(stem) = Path::new(filename)
    .file_stem()
    .and_then(|s| s.to_str())
  else {
    return false;
  };
  if stem.len() < 15 || stem.as_bytes().get(5) != Some(&b'_') {
    return false;
  }
  let rest = &stem[6..];
  let Some((token, _after)) = rest.split_once('_') else {
    return false;
  };
  token.len() == 8 && token.bytes().all(|b| b.is_ascii_hexdigit())
}

/// 旧版同步落盘：`{index:05d}_{stem}.ext`（无 id8）
pub fn is_legacy_sync_filename(filename: &str) -> bool {
  sync_index_from_filename(filename).is_some() && !is_new_format_sync_filename(filename)
}

/// 从同步落盘 basename 解析五位序号；非同步命名则 None
pub fn sync_index_from_filename(filename: &str) -> Option<u32> {
  let stem = Path::new(filename)
    .file_stem()
    .and_then(|s| s.to_str())?;
  if stem.len() >= 5 && stem[..5].chars().all(|c| c.is_ascii_digit()) {
    stem[..5].parse().ok()
  } else {
    None
  }
}

/// 去掉同步落盘 stem 上的 `{index}_` 与可选 `{id8}_`，供重复检测 content_key
pub fn strip_sync_filename_stem_prefix(stem: &str) -> String {
  let lower = stem.to_lowercase();
  let rest = if lower.len() >= 6
    && lower.as_bytes().get(5) == Some(&b'_')
    && lower[..5].chars().all(|c| c.is_ascii_digit())
  {
    &lower[6..]
  } else {
    return lower;
  };
  if let Some((token, after)) = rest.split_once('_') {
    if token.len() == 8 && token.bytes().all(|b| b.is_ascii_hexdigit()) {
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
  fn format_includes_stable_id8() {
    let name = format_asset_filename(1, "asset-uuid-1", "x", "jpg");
    assert!(name.starts_with("00001_"));
    assert!(name.ends_with("_x.jpg"));
    assert_eq!(
      format_asset_filename(1, "asset-uuid-1", "x", "jpg"),
      format_asset_filename(1, "asset-uuid-1", "x", "jpg")
    );
  }

  #[test]
  fn legacy_vs_new_format_detection() {
    let id8 = asset_id_token("A1");
    let new_name = format!("00042_{id8}_IMG_0027.HEIC");
    assert!(is_new_format_sync_filename(&new_name));
    assert!(is_legacy_sync_filename("00042_IMG_0027.HEIC"));
    assert!(!is_legacy_sync_filename(&new_name));
  }

  #[test]
  fn strip_prefix_handles_id8() {
    let id8 = asset_id_token("A1");
    let stem = format!("00042_{id8}_img_0027");
    assert_eq!(strip_sync_filename_stem_prefix(&stem), "img_0027");
    assert_eq!(
      strip_sync_filename_stem_prefix("00042_img_0027"),
      "img_0027"
    );
  }
}
