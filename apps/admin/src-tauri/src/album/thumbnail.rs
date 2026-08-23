//! 缩略图生成
//! 职责：网格 WebP 缩略图；HEIC 扫描时同步生成全尺寸预览 JPEG
//! 缓存位置：`<appData>/album/thumbs/v{version}/`

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use image::ImageFormat;

use super::ffmpeg;
use super::heic_decode;
use super::types::ALBUM_CACHE_VERSION;

/// 单张缩略图生成结果
#[derive(Debug, Clone, Default)]
pub struct ThumbnailOutcome {
  pub thumb_path: Option<String>,
  /// HEIC/HEIF 全尺寸预览 JPEG（扫描阶段生成，打开即可用）
  pub preview_path: Option<String>,
}

pub fn is_heif_ext(ext: &str) -> bool {
  ext == "heic" || ext == "heif"
}

fn is_video_ext(ext: &str) -> bool {
  matches!(
    ext,
    "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" | "m4v" | "3gp" | "mpeg" | "mpg"
  )
}

/// 全尺寸解码（HEIC 走 FFmpeg）
fn open_raster_image(file_path: &Path, ffmpeg_bin: Option<&Path>) -> Option<image::DynamicImage> {
  if let Ok(img) = image::open(file_path) {
    return Some(img);
  }

  let ext = file_path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  if !is_heif_ext(&ext) {
    return None;
  }

  heic_decode::decode_heif_file(file_path, ffmpeg_bin)
}

fn cache_key(path: &str, modified: i64, size: u32) -> String {
  let mut h = DefaultHasher::new();
  ALBUM_CACHE_VERSION.hash(&mut h);
  path.hash(&mut h);
  modified.hash(&mut h);
  size.hash(&mut h);
  format!("{:016x}", h.finish())
}

pub fn preview_cache_file(cache_dir: &Path, path: &str, modified: i64) -> PathBuf {
  let key = cache_key(path, modified, 0);
  cache_dir.join(format!("{key}_full.jpg"))
}

/// 保存全尺寸 RGB JPEG 供预览
pub fn save_preview_jpeg(img: &image::DynamicImage, preview_file: &Path) -> Option<String> {
  let rgb = image::DynamicImage::ImageRgb8(img.to_rgb8());
  match rgb.save(preview_file) {
    Ok(()) => Some(preview_file.to_string_lossy().into_owned()),
    Err(_) => None,
  }
}

fn thumb_cache_file(cache_dir: &Path, path: &str, modified: i64, target: u32) -> PathBuf {
  let key = cache_key(path, modified, target);
  cache_dir.join(format!("{key}.webp"))
}

fn save_thumb_webp(img: &image::DynamicImage, cache_file: &Path) -> Option<String> {
  let rgb = image::DynamicImage::ImageRgb8(img.to_rgb8());
  match rgb.save_with_format(cache_file, ImageFormat::WebP) {
    Ok(()) => Some(cache_file.to_string_lossy().into_owned()),
    Err(_) => None,
  }
}

/// 生成网格 WebP + HEIC 全尺寸预览（一次解码两用）
pub fn generate_thumbnail(
  path: &str,
  cache_dir: &Path,
  size: u32,
  ffmpeg_bin: Option<&Path>,
) -> ThumbnailOutcome {
  let _ = std::fs::create_dir_all(cache_dir);
  let file_path = Path::new(path);

  let modified = std::fs::metadata(file_path)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  let target = (size * 2).max(256);
  let cache_file = thumb_cache_file(cache_dir, path, modified, target);
  let preview_file = preview_cache_file(cache_dir, path, modified);

  let ext = file_path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  let is_heif = is_heif_ext(&ext);

  let thumb_ready = cache_file.is_file();
  let preview_ready = !is_heif || preview_file.is_file();

  if thumb_ready && preview_ready {
    return ThumbnailOutcome {
      thumb_path: Some(cache_file.to_string_lossy().into_owned()),
      preview_path: if is_heif {
        Some(preview_file.to_string_lossy().into_owned())
      } else {
        None
      },
    };
  }

  let need_decode = !thumb_ready || (is_heif && !preview_file.is_file());

  let img = if need_decode {
    if is_video_ext(&ext) {
      let ffmpeg = match ffmpeg_bin {
        Some(f) => f,
        None => return ThumbnailOutcome::default(),
      };
      let tmp_jpg = std::env::temp_dir().join(format!(
        "album_vid_thumb_{}.jpg",
        std::time::SystemTime::now()
          .duration_since(std::time::UNIX_EPOCH)
          .map(|d| d.as_nanos())
          .unwrap_or(0)
      ));
      if !ffmpeg::extract_video_poster(ffmpeg, file_path, &tmp_jpg) {
        let _ = std::fs::remove_file(&tmp_jpg);
        return ThumbnailOutcome::default();
      }
      let opened = image::open(&tmp_jpg).ok();
      let _ = std::fs::remove_file(&tmp_jpg);
      opened
    } else {
      open_raster_image(file_path, ffmpeg_bin)
    }
  } else {
    None
  };

  let preview_path = if is_heif {
    if preview_file.is_file() {
      Some(preview_file.to_string_lossy().into_owned())
    } else if let Some(ref full) = img {
      save_preview_jpeg(full, &preview_file)
    } else if let Some(full) = open_raster_image(file_path, ffmpeg_bin) {
      save_preview_jpeg(&full, &preview_file)
    } else {
      None
    }
  } else {
    None
  };

  let thumb_path = if thumb_ready {
    Some(cache_file.to_string_lossy().into_owned())
  } else if let Some(ref decoded) = img {
    let thumb = decoded.thumbnail(target, target);
    save_thumb_webp(&thumb, &cache_file)
  } else {
    None
  };

  ThumbnailOutcome {
    thumb_path,
    preview_path,
  }
}

/// 带进度回调的批量缩略图生成（并行）
pub fn generate_thumbnails_batch_with_progress(
  paths: &[String],
  cache_dir: &Path,
  size: u32,
  ffmpeg_bin: Option<&Path>,
  on_progress: Arc<dyn Fn(u32, u32) + Send + Sync>,
  done_counter: &AtomicU32,
  cancel: &super::scan_state::ScanCancelToken,
) -> Vec<ThumbnailOutcome> {
  if paths.is_empty() {
    return vec![];
  }

  let total = u32::try_from(paths.len()).unwrap_or(u32::MAX);
  let parallelism = std::thread::available_parallelism()
    .map(|n| n.get())
    .unwrap_or(4)
    .clamp(2, 8)
    .min(paths.len());
  let chunk_size = paths.len().div_ceil(parallelism);

  let mut results: Vec<Vec<ThumbnailOutcome>> = Vec::with_capacity(parallelism);

  std::thread::scope(|s| {
    let handles: Vec<_> = paths
      .chunks(chunk_size)
      .map(|chunk| {
        let progress = Arc::clone(&on_progress);
        let token = cancel.clone();
        s.spawn(move || {
          chunk
            .iter()
            .map(|p| {
              if token.is_cancelled() {
                return ThumbnailOutcome::default();
              }
              let result = generate_thumbnail(p, cache_dir, size, ffmpeg_bin);
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
