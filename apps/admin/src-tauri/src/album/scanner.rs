//! 目录扫描器
//! 职责：递归扫描、实况配对、增量索引、后台缩略图与事件推送

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU32;
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use super::db;
use super::scan_state::ScanCancelToken;
use super::thumbnail;
use super::types::{
  AlbumScanProgressPayload, AlbumThumbReadyPayload, MediaFile, MediaGroup, MediaKind,
  ALBUM_CACHE_VERSION,
};

pub const ALBUM_SCAN_PROGRESS_EVENT: &str = "album://scan-progress";
pub const ALBUM_THUMB_READY_EVENT: &str = "album://thumb-ready";
pub const ALBUM_FILES_CHANGED_EVENT: &str = "album://files-changed";

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

fn emit_thumb_ready(
  app: &AppHandle,
  path: &str,
  thumb_path: Option<String>,
  preview_path: Option<String>,
) {
  let _ = app.emit(
    ALBUM_THUMB_READY_EVENT,
    AlbumThumbReadyPayload {
      path: path.to_string(),
      thumb_path,
      preview_path,
    },
  );
}

/// 支持的图片扩展名
const IMAGE_EXTS: &[&str] = &[
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "tif", "svg", "avif",
];

/// 支持的视频扩展名
const VIDEO_EXTS: &[&str] = &[
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "mpeg", "mpg",
];

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

fn icloud_index_prefix(stem: &str) -> Option<String> {
  if stem.len() >= 6
    && stem.as_bytes().get(5) == Some(&b'_')
    && stem[..5].chars().all(|c| c.is_ascii_digit())
  {
    Some(stem[..5].to_string())
  } else {
    None
  }
}

const LIVE_MOV_STEM_SUFFIXES: &[&str] = &["_hevc", "_heic", "_mov"];

fn mov_stem_to_image_stem(mov_stem: &str) -> String {
  let lower = mov_stem.to_lowercase();
  for suffix in LIVE_MOV_STEM_SUFFIXES {
    if lower.ends_with(suffix) && lower.len() > suffix.len() {
      return lower[..lower.len() - suffix.len()].to_string();
    }
  }
  lower
}

struct MovCandidate {
  path: String,
  stem: String,
  index_prefix: Option<String>,
}

fn mov_matches_image_stem(mov: &MovCandidate, image_stem: &str) -> bool {
  mov.stem == image_stem || mov_stem_to_image_stem(&mov.stem) == image_stem
}

fn pair_live_photos(files: &mut Vec<MediaFile>) {
  let mov_candidates: Vec<MovCandidate> = files
    .iter()
    .filter(|f| f.ext == "mov")
    .map(|f| {
      let stem = file_stem_lower(&f.name);
      let index_prefix = icloud_index_prefix(&stem);
      MovCandidate {
        path: f.path.clone(),
        stem,
        index_prefix,
      }
    })
    .collect();

  let mut consumed_movs: HashSet<String> = HashSet::new();

  for file in files.iter_mut() {
    if file.kind != MediaKind::Image {
      continue;
    }
    let image_stem = file_stem_lower(&file.name);
    let image_index = icloud_index_prefix(&image_stem);

    let matched_mov = mov_candidates
      .iter()
      .filter(|m| !consumed_movs.contains(&m.path))
      .find(|m| {
        mov_matches_image_stem(m, &image_stem)
          || (image_index.is_some()
            && m.index_prefix.is_some()
            && image_index == m.index_prefix)
      });

    if let Some(mov) = matched_mov {
      file.kind = MediaKind::LivePhoto;
      file.video_path = Some(mov.path.clone());
      consumed_movs.insert(mov.path.clone());
    }
  }

  files.retain(|f| !(f.ext == "mov" && consumed_movs.contains(&f.path)));
}

fn cache_dir_for(album_dir: &Path) -> PathBuf {
  album_dir
    .join("thumbs")
    .join(format!("v{ALBUM_CACHE_VERSION}"))
}

/// 第一阶段：发现文件并构建分组（含索引命中缓存路径）
pub fn discover_groups(
  app: &AppHandle,
  root: &str,
  album_dir: &Path,
) -> Result<Vec<MediaGroup>, String> {
  let root_path = PathBuf::from(root);
  if !root_path.exists() {
    return Err(format!("目录不存在: {}", root));
  }
  if !root_path.is_dir() {
    return Err(format!("不是目录: {}", root));
  }

  let conn = db::open_db(album_dir)?;
  let indexed = db::load_indexed_paths(&conn, root)?;

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

    let parent = entry.path().parent().unwrap_or(&root_path).to_path_buf();
    let dir_files = dir_map.entry(parent).or_default();

    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_string();

    let file_path = path.to_string_lossy().to_string();
    let size = get_size(path);
    let modified = get_modified(path);

    let mut thumb_path = None;
    let mut preview_path = None;
    if let Some(row) = indexed.get(&file_path) {
      if row.size == size && row.modified == modified {
        if row
          .thumb_path
          .as_ref()
          .is_some_and(|p| Path::new(p).is_file())
        {
          thumb_path = row.thumb_path.clone();
        }
        if row
          .preview_path
          .as_ref()
          .is_some_and(|p| Path::new(p).is_file())
        {
          preview_path = row.preview_path.clone();
        }
      }
    }

    dir_files.push(MediaFile {
      path: file_path,
      name,
      kind: if is_image(&ext) {
        MediaKind::Image
      } else {
        MediaKind::Video
      },
      size,
      modified,
      ext,
      thumb_path,
      preview_path,
      video_path: None,
    });
    discovered += 1;
    if discovered == 1 || discovered % 20 == 0 {
      emit_scan_progress(app, "discover", discovered, 0);
    }
  }

  emit_scan_progress(app, "discover", discovered, discovered);

  for files in dir_map.values_mut() {
    pair_live_photos(files);
    files.sort_by(|a, b| a.name.cmp(&b.name));
  }

  let root_basename = root_path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or(root)
    .to_string();

  let mut alive_paths: Vec<String> = Vec::new();

  let mut groups: Vec<MediaGroup> = dir_map
    .into_iter()
    .map(|(dir_path, files)| {
      for f in &files {
        alive_paths.push(f.path.clone());
      }
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

  db::delete_stale_paths(&conn, root, &alive_paths)?;

  for group in &groups {
    for file in &group.files {
      db::upsert_media(
        &conn,
        root,
        &group.rel_path,
        file,
        file.thumb_path.as_deref(),
        file.preview_path.as_deref(),
      )?;
    }
  }

  Ok(groups)
}

/// 第二阶段：后台生成缺失缩略图，逐条推送事件
pub fn run_thumbnail_pipeline(
  app: AppHandle,
  _root: String,
  album_dir: PathBuf,
  thumb_size: u32,
  ffmpeg_bin: Option<PathBuf>,
  groups: Vec<MediaGroup>,
  cancel: ScanCancelToken,
) {
  let cache_dir = cache_dir_for(&album_dir);
  let conn = db::open_db(&album_dir).ok();

  let mut pending: Vec<(String, String)> = Vec::new();
  for group in &groups {
    for file in &group.files {
      let needs_thumb = file.thumb_path.is_none();
      let needs_preview =
        thumbnail::is_heif_ext(&file.ext) && file.preview_path.is_none();
      if needs_thumb || needs_preview {
        pending.push((group.rel_path.clone(), file.path.clone()));
      }
    }
  }

  let thumb_total = u32::try_from(pending.len()).unwrap_or(u32::MAX);
  emit_scan_progress(&app, "thumbnails", 0, thumb_total);

  if pending.is_empty() {
    return;
  }

  let done_counter = AtomicU32::new(0);
  let app_progress = app.clone();
  let on_progress = Arc::new(move |done: u32, total: u32| {
    emit_scan_progress(&app_progress, "thumbnails", done, total);
  });

  let paths: Vec<String> = pending.iter().map(|(_, p)| p.clone()).collect();
  let outcomes = thumbnail::generate_thumbnails_batch_with_progress(
    &paths,
    &cache_dir,
    thumb_size,
    ffmpeg_bin.as_deref(),
    on_progress,
    &done_counter,
    &cancel,
  );

  for (path, outcome) in paths.into_iter().zip(outcomes.into_iter()) {
    let thumb_path = outcome.thumb_path;
    let preview_path = outcome.preview_path;
    if let Some(conn) = &conn {
      let _ = db::update_cache_paths(
        conn,
        &path,
        thumb_path.as_deref(),
        preview_path.as_deref(),
      );
    }
    emit_thumb_ready(&app, &path, thumb_path.clone(), preview_path.clone());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn image_file(name: &str) -> MediaFile {
    MediaFile {
      path: format!("/tmp/{name}"),
      name: name.to_string(),
      kind: MediaKind::Image,
      size: 1,
      modified: 0,
      ext: name.rsplit('.').next().unwrap_or("jpg").to_lowercase(),
      thumb_path: None,
      preview_path: None,
      video_path: None,
    }
  }

  fn mov_file(name: &str) -> MediaFile {
    MediaFile {
      path: format!("/tmp/{name}"),
      name: name.to_string(),
      kind: MediaKind::Video,
      size: 1,
      modified: 0,
      ext: "mov".to_string(),
      thumb_path: None,
      preview_path: None,
      video_path: None,
    }
  }

  #[test]
  fn pair_same_stem_heic_mov() {
    let mut files = vec![image_file("IMG_1234.HEIC"), mov_file("IMG_1234.MOV")];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn pair_icloudpd_hevc_suffix_mov() {
    let mut files = vec![image_file("IMG_1234.HEIC"), mov_file("IMG_1234_HEVC.MOV")];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn pair_icloudpd_heic_suffix_mov() {
    let mut files = vec![image_file("IMG_5678.HEIC"), mov_file("IMG_5678_HEIC.MOV")];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn pair_icloud_sync_index_prefix_when_stems_differ() {
    let mut files = vec![
      image_file("00003_IMG_0027.HEIC"),
      mov_file("00003_IMG_0027_HEVC.MOV"),
    ];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn standalone_mov_stays_as_video() {
    let mut files = vec![mov_file("00004_clip.MOV")];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::Video);
  }
}
