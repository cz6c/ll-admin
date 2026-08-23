//! 缩略图生成
//! 职责：批量生成缩略图并缓存到磁盘；读取为 base64 data URL 嵌入扫描结果
//! 缓存位置：`<appData>/album/thumbs/`，以 path+modified+size 的哈希命名

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};

/// 生成缩略图缓存文件名（path + modified + size 的哈希）
fn cache_key(path: &str, modified: i64, size: u32) -> String {
  let mut h = DefaultHasher::new();
  path.hash(&mut h);
  modified.hash(&mut h);
  size.hash(&mut h);
  format!("{:016x}", h.finish())
}

/// 生成单张缩略图（同步）
/// 成功返回缓存文件路径；失败返回 None（不回退原图，避免前端加载大文件）
pub fn generate_thumbnail(path: &str, cache_dir: &Path, size: u32) -> Option<String> {
  let _ = std::fs::create_dir_all(cache_dir);
  let file_path = Path::new(path);

  let modified = std::fs::metadata(file_path)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  let target = (size * 2).max(256);
  let key = cache_key(path, modified, target);
  let cache_file = cache_dir.join(format!("{key}.jpg"));

  if cache_file.exists() {
    return Some(cache_file.to_string_lossy().into_owned());
  }

  let img = image::open(file_path).ok()?;
  let thumb = img.thumbnail(target, target);

  // 显式转 RGB8，确保 JPEG 保存成功（PNG/WebP 可能带 alpha 通道导致保存失败）
  let rgb_thumb = image::DynamicImage::ImageRgb8(thumb.to_rgb8());

  match rgb_thumb.save(&cache_file) {
    Ok(()) => Some(cache_file.to_string_lossy().into_owned()),
    Err(_) => None,
  }
}

/// 带进度回调的批量缩略图生成（每完成一张回调 done/total）
pub fn generate_thumbnails_batch_with_progress(
  paths: &[String],
  cache_dir: &Path,
  size: u32,
  on_progress: Arc<dyn Fn(u32, u32) + Send + Sync>,
  done_counter: &AtomicU32,
) -> Vec<Option<String>> {
  if paths.is_empty() {
    return vec![];
  }
  let total = u32::try_from(paths.len()).unwrap_or(u32::MAX);
  let n_threads = 4.min(paths.len());
  let chunk_size = paths.len().div_ceil(n_threads);

  let mut results: Vec<Vec<Option<String>>> = Vec::with_capacity(n_threads);

  std::thread::scope(|s| {
    let handles: Vec<_> = paths
      .chunks(chunk_size)
      .map(|chunk| {
        let progress = Arc::clone(&on_progress);
        s.spawn(move || {
          chunk
            .iter()
            .map(|p| {
              let result = generate_thumbnail(p, cache_dir, size);
              let done = done_counter.fetch_add(1, Ordering::Relaxed) + 1;
              progress(done, total);
              result
            })
            .collect::<Vec<_>>()
        })
      })
      .collect();

    for handle in handles {
      results.push(handle.join().unwrap_or_default());
    }
  });

  results.into_iter().flatten().collect()
}

/// 读取缩略图文件为 base64 data URL
/// 前端直接用 `<img :src="thumbData">` 渲染，零 asset 协议开销
pub fn read_as_data_url(path: &str) -> Option<String> {
  let data = std::fs::read(path).ok()?;
  let encoded = general_purpose::STANDARD.encode(&data);
  Some(format!("data:image/jpeg;base64,{encoded}"))
}
