//! 缩略图生成
//! 职责：网格 WebP 缩略图；HEIC 扫描时同步生成全尺寸预览 JPEG；HEVC 播放代理路径
//! 缓存位置：`<appData>/album/thumbs/v{ALBUM_CACHE_VERSION}/`（目录代际由 types 常量 bump）

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use image::ImageFormat;

use super::ffmpeg;
use super::heic_decode;

/// 单张缩略图生成结果
#[derive(Debug, Clone, Default)]
pub struct ThumbnailOutcome {
  pub thumb_path: Option<String>,
  /// HEIC/HEIF 全尺寸预览 JPEG（扫描阶段生成，打开即可用）
  pub preview_path: Option<String>,
  /// 源媒体像素宽（解码或轻量探测）；缓存命中且无法探测时为 None
  pub width: Option<u32>,
  /// 源媒体像素高
  pub height: Option<u32>,
  /// 因扫描取消提前返回；勿计入 fail_count，否则重扫几次会误杀健康文件
  pub cancelled: bool,
}

pub fn is_heif_ext(ext: &str) -> bool {
  ext == "heic" || ext == "heif"
}

pub fn is_video_ext(ext: &str) -> bool {
  matches!(
    ext,
    "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" | "m4v" | "3gp" | "mpeg" | "mpg"
  )
}

/// WebView 可原生显示的栅格扩展名：解码全失败时可把原路径当 `thumb_path`（须再过体积/像素门禁）
/// @note HEIC/TIFF/AVIF/SVG/GIF 不在此列——GIF 动图多格同播会拖垮 WebView
pub fn can_use_origin_as_thumb(ext: &str) -> bool {
  matches!(
    ext,
    "jpg" | "jpeg" | "png" | "webp" | "bmp"
  )
}

/// 原图当缩略图：文件体积上限（与 discover 小图优化一致）
pub const ORIGIN_AS_THUMB_MAX_BYTES: u64 = 100 * 1024;
/// 原图当缩略图：像素上限（约 2MP）；超限即使体积小也不回退，避免 WebView 解码灾难
pub const ORIGIN_AS_THUMB_MAX_PIXELS: u64 = 2_000_000;
/// 超过此像素数禁止先全尺寸进内存：改走 ffmpeg scale-on-decode（约 8MP）
pub const FULL_DECODE_MAX_PIXELS: u64 = 8_000_000;

/**
 * 是否允许把原文件路径写入 `thumb_path`（给 WebView 直接加载）
 * @note 大图解码失败时绝不能回退原路径——宫格会解码整图导致卡死
 */
pub fn may_reuse_origin_as_thumb(ext: &str, file_path: &Path) -> bool {
  if !can_use_origin_as_thumb(ext) || !file_path.is_file() {
    return false;
  }
  let Ok(meta) = std::fs::metadata(file_path) else {
    return false;
  };
  if meta.len() > ORIGIN_AS_THUMB_MAX_BYTES {
    return false;
  }
  if let Ok((w, h)) = image::image_dimensions(file_path) {
    let pixels = u64::from(w).saturating_mul(u64::from(h));
    if pixels > ORIGIN_AS_THUMB_MAX_PIXELS {
      return false;
    }
  }
  true
}

/// 像素量是否超过全尺寸解码安全阈值（须改 ffmpeg 边解边缩）
pub fn needs_scaled_raster_decode(width: u32, height: u32) -> bool {
  u64::from(width).saturating_mul(u64::from(height)) > FULL_DECODE_MAX_PIXELS
}

/// 栅格解码供网格缩略图：超阈值优先 ffmpeg scale；普通图 `image` → ffmpeg scale 回退
/// @note HEIF 仍走专用全尺寸路径（lightbox preview 需要）；`thumb_max_side` 仅作用于非 HEIF
fn open_raster_image(
  file_path: &Path,
  ffmpeg_bin: Option<&Path>,
  thumb_max_side: u32,
) -> Option<image::DynamicImage> {
  let ext = file_path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  if is_heif_ext(&ext) {
    return heic_decode::decode_heif_file(file_path, ffmpeg_bin);
  }

  let prefer_scale = image::image_dimensions(file_path)
    .ok()
    .map(|(w, h)| needs_scaled_raster_decode(w, h))
    .unwrap_or(false);

  if prefer_scale {
    if let Some(ffmpeg) = ffmpeg_bin {
      if let Some(img) =
        ffmpeg::decode_raster_via_ffmpeg(ffmpeg, file_path, Some(thumb_max_side))
      {
        return Some(img);
      }
      log::warn!(
        "album: 超大图 ffmpeg scale 失败，尝试全尺寸兜底 ({})",
        file_path.display()
      );
    } else {
      log::warn!(
        "album: 超大图需 scale 解码但无 ffmpeg，尝试全尺寸 ({})",
        file_path.display()
      );
    }
  }

  match image::open(file_path) {
    Ok(img) => return Some(img),
    Err(e) => {
      log::debug!(
        "album: image crate 打开失败，尝试回退 ({}, {})",
        file_path.display(),
        e
      );
    }
  }

  if let Some(ffmpeg) = ffmpeg_bin {
    // 缩略图回退一律带 scale：畸形/非标大图避免二次全尺寸 OOM
    if let Some(img) =
      ffmpeg::decode_raster_via_ffmpeg(ffmpeg, file_path, Some(thumb_max_side))
    {
      return Some(img);
    }
    log::warn!(
      "album: ffmpeg 栅格解码失败 ({})",
      file_path.display()
    );
  }

  None
}

/// 缓存文件名哈希：stem + modified + size（缩略图 target）
/// discover 复用 DB 里的绝对路径，不据此查找；换规则须 bump `ALBUM_CACHE_VERSION` 清目录
fn cache_key(path: &str, modified: i64, size: u32) -> String {
  let stem = Path::new(path)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase();
  let mut h = DefaultHasher::new();
  stem.hash(&mut h);
  modified.hash(&mut h);
  size.hash(&mut h);
  format!("{:016x}", h.finish())
}

pub fn preview_cache_file(cache_dir: &Path, path: &str, modified: i64) -> PathBuf {
  let key = cache_key(path, modified, 0);
  cache_dir.join(format!("{key}_full.jpg"))
}

/// HEVC→H.264 播放代理缓存路径（WebView 无法硬解 HEVC 时使用）
pub fn playback_cache_file(cache_dir: &Path, path: &str, modified: i64) -> PathBuf {
  let key = cache_key(path, modified, 0);
  cache_dir.join(format!("{key}_play.mp4"))
}

/// 若磁盘已有 HEVC 播放代理则返回绝对路径（供 discover 写库、删文件兜底）
pub fn probe_playback_cache(cache_dir: &Path, source_path: &str) -> Option<String> {
  let src = Path::new(source_path);
  if !src.is_file() {
    return None;
  }
  let modified = std::fs::metadata(src)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);
  let cache = playback_cache_file(cache_dir, source_path, modified);
  if cache.is_file() && std::fs::metadata(&cache).map(|m| m.len() > 0).unwrap_or(false) {
    Some(cache.to_string_lossy().into_owned())
  } else {
    None
  }
}

/// 保存全尺寸 RGB JPEG 供预览（先写 partial 再改名，空文件不当命中）
pub fn save_preview_jpeg(img: &image::DynamicImage, preview_file: &Path) -> Option<String> {
  let partial = partial_sibling(preview_file);
  let rgb = image::DynamicImage::ImageRgb8(img.to_rgb8());
  if rgb.save_with_format(&partial, ImageFormat::Jpeg).is_err() {
    let _ = std::fs::remove_file(&partial);
    return None;
  }
  publish_partial(&partial, preview_file)
}

fn thumb_cache_file(cache_dir: &Path, path: &str, modified: i64, target: u32) -> PathBuf {
  let key = cache_key(path, modified, target);
  cache_dir.join(format!("{key}.webp"))
}

fn save_thumb_webp(img: &image::DynamicImage, cache_file: &Path) -> Option<String> {
  let partial = partial_sibling(cache_file);
  let rgb = image::DynamicImage::ImageRgb8(img.to_rgb8());
  if rgb.save_with_format(&partial, ImageFormat::WebP).is_err() {
    let _ = std::fs::remove_file(&partial);
    return None;
  }
  publish_partial(&partial, cache_file)
}

fn partial_sibling(path: &Path) -> PathBuf {
  let mut name = path.file_name().unwrap_or_default().to_os_string();
  name.push(".partial");
  path.with_file_name(name)
}

fn nonempty_file(path: &Path) -> bool {
  path.is_file() && std::fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false)
}

/// 成品非空才改名；失败删除 partial，避免半截文件被当成缓存命中
fn publish_partial(partial: &Path, final_path: &Path) -> Option<String> {
  if !nonempty_file(partial) {
    let _ = std::fs::remove_file(partial);
    return None;
  }
  if final_path.is_file() {
    let _ = std::fs::remove_file(final_path);
  }
  if std::fs::rename(partial, final_path).is_err() {
    let _ = std::fs::remove_file(partial);
    return None;
  }
  Some(final_path.to_string_lossy().into_owned())
}

/// 生成网格 WebP。HEIC 另见 `generate_heif_thumbnail`：先落全尺寸预览 JPEG，再边解边缩缩略图
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
  // target≈316（size=158）：对齐宫格 ~180～210 × DPR≤1.5；改 size/公式须 bump ALBUM_CACHE_VERSION
  let cache_file = thumb_cache_file(cache_dir, path, modified, target);
  let preview_file = preview_cache_file(cache_dir, path, modified);

  let ext = file_path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  let is_heif = is_heif_ext(&ext);
  if is_heif {
    return generate_heif_thumbnail(path, file_path, &cache_file, &preview_file, target, ffmpeg_bin);
  }

  let thumb_ready = nonempty_file(&cache_file);

  if thumb_ready {
    // 缓存命中未解码：栅格轻量探测尺寸；视频正式分辨率改打开时 ffprobe，此处不写
    let (width, height) = if is_video_ext(&ext) {
      (None, None)
    } else {
      image::image_dimensions(file_path)
        .ok()
        .map(|(w, h)| (Some(w), Some(h)))
        .unwrap_or((None, None))
    };
    return ThumbnailOutcome {
      thumb_path: Some(cache_file.to_string_lossy().into_owned()),
      width,
      height,
      ..Default::default()
    };
  }

  let img = if is_video_ext(&ext) {
      let ffmpeg = match ffmpeg_bin {
        Some(f) => f,
        None => {
          log::warn!("album: ffmpeg 未找到，无法生成视频缩略图 ({})", file_path.display());
          return ThumbnailOutcome::default();
        }
      };
      match ffmpeg::decode_video_poster(ffmpeg, file_path) {
        Some(img) => Some(img),
        None => {
          log::warn!("album: 视频首帧提取失败 ({})", file_path.display());
          return ThumbnailOutcome::default();
        }
      }
    } else {
      open_raster_image(file_path, ffmpeg_bin, target)
  };

  let thumb_path = if let Some(ref decoded) = img {
    let thumb = decoded.thumbnail(target, target);
    save_thumb_webp(&thumb, &cache_file)
  } else if may_reuse_origin_as_thumb(&ext, file_path) {
    log::info!(
      "album: 缩略图解码失败，回退小图原路径 ({})",
      file_path.display()
    );
    Some(path.to_string())
  } else {
    if can_use_origin_as_thumb(&ext) && file_path.is_file() {
      log::warn!(
        "album: 缩略图解码失败且原图过大/不适合作缩略图，留空占位 ({})",
        file_path.display()
      );
    }
    None
  };

  // 宽高：超大图可能经 scale 解码，元数据必须用文件头，不能写缩略图像素
  // 视频封面帧尺寸不作正式分辨率（打开时 ffprobe）
  let (width, height) = if is_video_ext(&ext) {
    (None, None)
  } else {
    let header = image::image_dimensions(file_path).ok();
    if let Some((w, h)) = header.filter(|(w, h)| needs_scaled_raster_decode(*w, *h)) {
      (Some(w), Some(h))
    } else if let Some(ref decoded) = img {
      (Some(decoded.width()), Some(decoded.height()))
    } else {
      header
        .map(|(w, h)| (Some(w), Some(h)))
        .unwrap_or((None, None))
    }
  };

  ThumbnailOutcome {
    thumb_path,
    width,
    height,
    ..Default::default()
  }
}

/**
 * HEIC/HEIF：ffmpeg 直接写全尺寸预览 JPEG，再从该 JPEG 边解边缩出宫格 WebP
 * @note 1200 万～2400 万不缩小预览。无 ffmpeg 时才 WIC 全尺寸位图，同时写出两份产物
 */
fn generate_heif_thumbnail(
  _path: &str,
  file_path: &Path,
  cache_file: &Path,
  preview_file: &Path,
  target: u32,
  ffmpeg_bin: Option<&Path>,
) -> ThumbnailOutcome {
  let mut preview_path = if nonempty_file(preview_file) {
    Some(preview_file.to_string_lossy().into_owned())
  } else if let Some(ffmpeg) = ffmpeg_bin {
    let partial = partial_sibling(preview_file);
    if ffmpeg::convert_heif_to_jpeg(ffmpeg, file_path, &partial) {
      publish_partial(&partial, preview_file)
    } else {
      let _ = std::fs::remove_file(&partial);
      None
    }
  } else {
    None
  };

  if preview_path.is_none() {
    // ffmpeg 失败或缺失：平台解码一次，预览与缩略图都从这份位图写出
    if let Some(full) = heic_decode::decode_heif_file(file_path, None) {
      preview_path = save_preview_jpeg(&full, preview_file);
      let thumb = full.thumbnail(target, target);
      let thumb_path = save_thumb_webp(&thumb, cache_file);
      return ThumbnailOutcome {
        thumb_path,
        preview_path,
        width: Some(full.width()),
        height: Some(full.height()),
        ..Default::default()
      };
    }
    log::warn!("album: HEIC 全尺寸预览失败 ({})", file_path.display());
    return ThumbnailOutcome::default();
  }

  let thumb_path = if nonempty_file(cache_file) {
    Some(cache_file.to_string_lossy().into_owned())
  } else if let Some(ffmpeg) = ffmpeg_bin {
    ffmpeg::decode_raster_via_ffmpeg(ffmpeg, preview_file, Some(target))
      .and_then(|img| save_thumb_webp(&img, cache_file))
  } else {
    image::open(preview_file)
      .ok()
      .and_then(|img| save_thumb_webp(&img.thumbnail(target, target), cache_file))
  };

  // 预览 JPEG 与源同分辨率；HEIC 文件头 image crate 读不到时用预览尺寸
  let (width, height) = image::image_dimensions(preview_file)
    .ok()
    .map(|(w, h)| (Some(w), Some(h)))
    .unwrap_or((None, None));

  if thumb_path.is_none() && preview_path.is_none() {
    return ThumbnailOutcome::default();
  }
  ThumbnailOutcome {
    thumb_path,
    preview_path,
    width,
    height,
    ..Default::default()
  }
}

/// 带进度回调的批量缩略图生成（并行）
/// @note HEIC 单独限流，不与小图缩略图共用满核；结果顺序与 `paths` 对齐
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
  let mut results = vec![ThumbnailOutcome::default(); paths.len()];
  let heif_cap = if ffmpeg::under_memory_pressure() { 1 } else { 2 };
  let mut raster_cap = if ffmpeg::under_memory_pressure() {
    2
  } else {
    std::thread::available_parallelism()
      .map(|n| n.get())
      .unwrap_or(4)
      .clamp(2, 4)
  };

  let mut heif_idx = Vec::new();
  let mut raster_idx = Vec::new();
  for (i, path) in paths.iter().enumerate() {
    let ext = Path::new(path)
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.to_lowercase())
      .unwrap_or_default();
    if is_heif_ext(&ext) {
      heif_idx.push(i);
    } else {
      raster_idx.push(i);
    }
  }
  if !heif_idx.is_empty() {
    // 与 HEIC 全尺寸解码同时跑时，小图池再让出核，避免两池叠满
    raster_cap = raster_cap.min(2);
  }

  std::thread::scope(|s| {
    let progress = &on_progress;
    let spawn_pool = |indices: Vec<usize>, cap: usize| {
      if indices.is_empty() {
        return Vec::new();
      }
      let parallelism = cap.min(indices.len()).max(1);
      let chunk_size = indices.len().div_ceil(parallelism);
      indices
        .chunks(chunk_size)
        .map(|chunk| {
          let chunk = chunk.to_vec();
          let progress = Arc::clone(progress);
          let token = cancel.clone();
          s.spawn(move || {
            let mut local = Vec::with_capacity(chunk.len());
            for index in chunk {
              if token.is_cancelled() {
                local.push((
                  index,
                  ThumbnailOutcome {
                    cancelled: true,
                    ..Default::default()
                  },
                ));
                continue;
              }
              let result = generate_thumbnail(&paths[index], cache_dir, size, ffmpeg_bin);
              let done = done_counter.fetch_add(1, Ordering::Relaxed) + 1;
              progress(done, total);
              local.push((index, result));
            }
            local
          })
        })
        .collect::<Vec<_>>()
    };

    let raster_handles = spawn_pool(raster_idx, raster_cap);
    let heif_handles = spawn_pool(heif_idx, heif_cap);
    for handle in raster_handles.into_iter().chain(heif_handles) {
      for (index, outcome) in handle.join().unwrap_or_default() {
        results[index] = outcome;
      }
    }
  });

  results
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::{Path, PathBuf};

  #[test]
  fn cache_key_stable_for_same_source() {
    let dir = Path::new("/tmp/thumbs/v5");
    let path = "E:\\photos\\00001_IMG_1.HEIC";
    let modified = 1_700_000_000_i64;
    assert_eq!(
      preview_cache_file(dir, path, modified),
      preview_cache_file(dir, path, modified)
    );
  }

  #[test]
  fn cache_key_changes_when_modified_changes() {
    let dir = Path::new("/tmp/thumbs/v5");
    let path = "E:\\photos\\00001_IMG_1.HEIC";
    assert_ne!(
      preview_cache_file(dir, path, 100),
      preview_cache_file(dir, path, 101)
    );
  }

  #[test]
  fn can_use_origin_as_thumb_covers_browser_rasters() {
    assert!(can_use_origin_as_thumb("jpg"));
    assert!(can_use_origin_as_thumb("jpeg"));
    assert!(can_use_origin_as_thumb("png"));
    assert!(can_use_origin_as_thumb("webp"));
    assert!(!can_use_origin_as_thumb("gif"));
    assert!(!can_use_origin_as_thumb("heic"));
    assert!(!can_use_origin_as_thumb("mp4"));
  }

  #[test]
  fn needs_scaled_raster_decode_trips_above_8mp() {
    assert!(!needs_scaled_raster_decode(4000, 2000)); // 8MP 边界内
    assert!(!needs_scaled_raster_decode(1, 1));
    assert!(needs_scaled_raster_decode(4001, 2000)); // >8MP
    assert!(needs_scaled_raster_decode(10923, 16384)); // 实锤卡顿样本量级
  }

  /// image+ffmpeg 都解不开时，浏览器可显格式应回退原路径，避免永久 JPG 占位
  #[test]
  fn generate_thumbnail_falls_back_to_origin_for_corrupt_jpg() {
    let base = std::env::temp_dir().join(format!(
      "album_thumb_origin_fb_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
    ));
    let _ = std::fs::create_dir_all(&base);
    let jpg = base.join("corrupt.jpg");
    std::fs::write(&jpg, b"not-a-real-jpeg").expect("write corrupt jpg");
    let cache = base.join("cache");
    let _ = std::fs::create_dir_all(&cache);
    let path = jpg.to_string_lossy().into_owned();
    let outcome = generate_thumbnail(&path, &cache, crate::album::types::ALBUM_THUMB_GENERATE_SIZE, None);
    assert_eq!(outcome.thumb_path.as_deref(), Some(path.as_str()));
    let _ = std::fs::remove_dir_all(&base);
  }

  /// 本机有样本与捆绑 ffmpeg 时：>8MP JPG 须出 WebP，且 thumb 不是原路径
  #[test]
  fn generate_thumbnail_scales_huge_jpg_sample_if_present() {
    let src = Path::new(r"E:\testFiles\daniel-gomez-9QHmQTsSpIo-unsplash.jpg");
    if !src.is_file() {
      return;
    }
    let ffmpeg = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("resources")
      .join("ffmpeg.exe");
    if !ffmpeg.is_file() {
      return;
    }
    let cache = std::env::temp_dir().join(format!(
      "album_thumb_huge_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
    ));
    let _ = std::fs::create_dir_all(&cache);
    let path = src.to_string_lossy().into_owned();
    let outcome = generate_thumbnail(&path, &cache, crate::album::types::ALBUM_THUMB_GENERATE_SIZE, Some(ffmpeg.as_path()));
    let thumb = outcome.thumb_path.expect("huge jpg should get webp thumb");
    assert_ne!(thumb, path);
    assert!(thumb.ends_with(".webp"));
    assert!(Path::new(&thumb).is_file());
    assert_eq!(outcome.width, Some(10923));
    assert_eq!(outcome.height, Some(16384));
    let _ = std::fs::remove_dir_all(&cache);
  }
}
