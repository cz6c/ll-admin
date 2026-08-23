//! 目录扫描器
//! 职责：递归扫描根目录，按子目录分组，识别实况照片（JPG+MOV 配对）
//! 扫描完成后批量生成缩略图并读取为 base64 data URL，嵌入 MediaFile.thumbData

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU32;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use super::thumbnail;
use super::types::{AlbumScanProgressPayload, MediaFile, MediaGroup, MediaKind};

pub const ALBUM_SCAN_PROGRESS_EVENT: &str = "album://scan-progress";

fn emit_scan_progress(app: &AppHandle, phase: &str, done: u32, total: u32) {
  let _ = app.emit(
    ALBUM_SCAN_PROGRESS_EVENT,
    AlbumScanProgressPayload {
      phase: phase.to_string(),
      done,
      total,
    },
  );
}

/// 支持的图片扩展名
const IMAGE_EXTS: &[&str] = &[
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "heif",
  "tiff",
  "tif",
  "svg",
  "avif",
];

/// 支持的视频扩展名
const VIDEO_EXTS: &[&str] = &[
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "flv",
  "wmv",
  "m4v",
  "3gp",
  "mpeg",
  "mpg",
];

/// 跳过的目录名（性能 + 系统目录）
const SKIP_DIRS: &[&str] = &[
  ".git",
  "node_modules",
  "$RECYCLE.BIN",
  "System Volume Information",
  ".DS_Store",
  "__pycache__",
  ".cache",
  ".thumbnails",
  "Thumbs.db",
];

fn get_ext(path: &Path) -> String {
  path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default()
}

fn is_image(ext: &str) -> bool {
  IMAGE_EXTS.contains(&ext)
}

fn is_video(ext: &str) -> bool {
  VIDEO_EXTS.contains(&ext)
}

fn get_modified(path: &Path) -> i64 {
  std::fs::metadata(path)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0)
}

fn get_size(path: &Path) -> u64 {
  std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn file_stem_lower(name: &str) -> String {
  Path::new(name)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase()
}

/// 扫描根目录，返回按子目录分组的媒体文件列表
/// 扫描完成后批量生成缩略图并读取为 base64，thumbData 字段已填充
pub fn scan_directory(
  app: &AppHandle,
  root: &str,
  cache_dir: &Path,
  thumb_size: u32,
) -> Result<Vec<MediaGroup>, String> {
  let root_path = PathBuf::from(root);
  if !root_path.exists() {
    return Err(format!("目录不存在: {}", root));
  }
  if !root_path.is_dir() {
    return Err(format!("不是目录: {}", root));
  }

  // 第一轮：收集每个目录下的媒体文件
  let mut dir_map: HashMap<PathBuf, Vec<MediaFile>> = HashMap::new();
  let mut discovered = 0u32;
  emit_scan_progress(app, "discover", 0, 0);

  for entry in WalkDir::new(&root_path)
    .min_depth(1)
    .into_iter()
    .filter_entry(|e| {
      if e.file_type().is_dir() {
        let name = e.file_name().to_string_lossy();
        !SKIP_DIRS.contains(&name.as_ref())
      } else {
        true
      }
    })
    .filter_map(|e| e.ok())
  {
    if !entry.file_type().is_file() {
      continue;
    }
    let path = entry.path();
    let ext = get_ext(path);
    if !is_image(&ext) && !is_video(&ext) {
      continue;
    }

    let parent = entry
      .path()
      .parent()
      .unwrap_or(&root_path)
      .to_path_buf();
    let dir_files = dir_map.entry(parent).or_default();

    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_string();

    dir_files.push(MediaFile {
      path: path.to_string_lossy().to_string(),
      name,
      kind: if is_image(&ext) {
        MediaKind::Image
      } else {
        MediaKind::Video
      },
      size: get_size(path),
      modified: get_modified(path),
      ext,
      thumb_data: None,
      video_path: None,
    });
    discovered += 1;
    if discovered == 1 || discovered % 10 == 0 {
      emit_scan_progress(app, "discover", discovered, 0);
    }
  }

  emit_scan_progress(app, "discover", discovered, discovered);

  // 第二轮：检测实况照片（同名 image + .mov 配对）
  for files in dir_map.values_mut() {
    let video_map: HashMap<String, String> = files
      .iter()
      .filter(|f| f.ext == "mov")
      .map(|f| (file_stem_lower(&f.name), f.path.clone()))
      .collect();

    let mut consumed_movs: HashSet<String> = HashSet::new();

    for file in files.iter_mut() {
      if file.kind == MediaKind::Image {
        let stem = file_stem_lower(&file.name);
        if let Some(video_path) = video_map.get(&stem) {
          file.kind = MediaKind::LivePhoto;
          file.video_path = Some(video_path.clone());
          consumed_movs.insert(video_path.clone());
        }
      }
    }

    files.retain(|f| !(f.ext == "mov" && consumed_movs.contains(&f.path)));
    // iCloud 同步落盘为 {index:05d}_{stem}.{ext}，按文件名升序即按图库顺序
    files.sort_by(|a, b| a.name.cmp(&b.name));
  }

  // 第三轮：批量生成缩略图（4 线程并行），然后读取为 base64 data URL
  let image_paths: Vec<String> = dir_map
    .values()
    .flat_map(|files| files.iter())
    .filter(|f| f.kind == MediaKind::Image || f.kind == MediaKind::LivePhoto)
    .map(|f| f.path.clone())
    .collect();

  let thumb_total = u32::try_from(image_paths.len()).unwrap_or(u32::MAX);
  emit_scan_progress(app, "thumbnails", 0, thumb_total);

  let done_counter = AtomicU32::new(0);
  let app_for_thumbs = app.clone();
  let on_thumb_progress = Arc::new(move |done: u32, total: u32| {
    emit_scan_progress(&app_for_thumbs, "thumbnails", done, total);
  });
  let thumb_paths = thumbnail::generate_thumbnails_batch_with_progress(
    &image_paths,
    cache_dir,
    thumb_size,
    on_thumb_progress,
    &done_counter,
  );

  // path → thumbData 映射（生成成功的才有值）
  let mut path_to_thumb: HashMap<String, String> = HashMap::new();
  for (orig_path, thumb_result) in image_paths.into_iter().zip(thumb_paths.into_iter()) {
    if let Some(thumb_path) = thumb_result {
      if let Some(data_url) = thumbnail::read_as_data_url(&thumb_path) {
        path_to_thumb.insert(orig_path, data_url);
      }
    }
  }

  for files in dir_map.values_mut() {
    for file in files.iter_mut() {
      if file.kind == MediaKind::Image || file.kind == MediaKind::LivePhoto {
        file.thumb_data = path_to_thumb.remove(&file.path);
      }
    }
  }

  // 构建分组，按目录路径排序
  let root_basename = root_path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or(root)
    .to_string();

  let mut groups: Vec<MediaGroup> = dir_map
    .into_iter()
    .map(|(dir_path, files)| {
      let rel_path = dir_path
        .strip_prefix(&root_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());
      let dir_name = if rel_path == "." {
        root_basename.clone()
      } else {
        dir_path
          .file_name()
          .and_then(|n| n.to_str())
          .unwrap_or(&root_basename)
          .to_string()
      };
      MediaGroup {
        dir_name,
        dir_path: dir_path.to_string_lossy().to_string(),
        rel_path,
        files,
      }
    })
    .collect();

  groups.sort_by(|a, b| {
    if a.rel_path == "." {
      std::cmp::Ordering::Less
    } else if b.rel_path == "." {
      std::cmp::Ordering::Greater
    } else {
      a.rel_path.cmp(&b.rel_path)
    }
  });

  Ok(groups)
}
