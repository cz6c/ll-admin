//! HEIC/HEIF 全尺寸预览（懒加载）
//! 职责：打开查看器时按需生成 `{hash}_full.jpg`，扫描阶段不阻塞

use std::path::Path;

use super::heic_decode;
use super::thumbnail::{is_heif_ext, preview_cache_file, save_preview_jpeg};

/// 确保 HEIC/HEIF 存在全尺寸预览缓存，返回缓存路径
pub fn ensure_heif_preview(
  file_path: &str,
  cache_dir: &Path,
  ffmpeg_bin: Option<&Path>,
) -> Option<String> {
  let path = Path::new(file_path);
  let ext = path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  if !is_heif_ext(&ext) {
    return None;
  }

  let modified = std::fs::metadata(path)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  let preview_file = preview_cache_file(cache_dir, file_path, modified);
  if preview_file.is_file() {
    return Some(preview_file.to_string_lossy().into_owned());
  }

  let img = heic_decode::decode_heif_file(path, ffmpeg_bin)?;
  save_preview_jpeg(&img, &preview_file)
}
