//! 目录扫描器
//! 职责：递归扫描、实况配对、增量索引、后台缩略图与事件推送

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use super::db;
use super::ffmpeg;
use super::media_meta::{MediaMetaFill, MediaMetaResolver};
use super::scan_state::ScanCancelToken;
use super::thumbnail;
use super::types::{
  AlbumScanProgressPayload, AlbumThumbReadyPayload, MediaFile, MediaGroup, MediaKind,
  ALBUM_CACHE_VERSION,
};

pub const ALBUM_SCAN_PROGRESS_EVENT: &str = "album://scan-progress";
pub const ALBUM_THUMB_READY_EVENT: &str = "album://thumb-ready";

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
  capture_at: Option<String>,
  camera: Option<String>,
  width: Option<u32>,
  height: Option<u32>,
  playback_path: Option<String>,
) {
  let _ = app.emit(
    ALBUM_THUMB_READY_EVENT,
    AlbumThumbReadyPayload {
      path: path.to_string(),
      thumb_path,
      preview_path,
      capture_at,
      camera,
      width,
      height,
      playback_path,
    },
  );
}

/// EXIF/sync 回填并行度（每线程自开只读 sync 库）
const META_PARALLEL: usize = 4;
/// Live 预热转码并行度：每路 HEVC→H.264 吃满多核+大内存；>2 易拖垮整机
const LIVE_PROXY_PARALLEL: usize = 2;

/// 缩略图已就绪后：EXIF/sync 仅补空字段，再推前端（限并发读 EXIF）
fn persist_meta_for_paths(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  paths: &[String],
) {
  if paths.is_empty() {
    return;
  }
  let parallelism = META_PARALLEL.min(paths.len()).max(1);
  let chunk_size = paths.len().div_ceil(parallelism);
  let mut fills: Vec<(String, MediaMetaFill)> = Vec::with_capacity(paths.len());

  std::thread::scope(|s| {
    let handles: Vec<_> = paths
      .chunks(chunk_size)
      .map(|chunk| {
        let app = app.clone();
        s.spawn(move || {
          // 每线程独立打开 sync 只读库，避免 Connection 跨线程
          let resolver = MediaMetaResolver::new(&app);
          chunk
            .iter()
            .filter_map(|path| {
              let fill = resolver.resolve(path);
              if fill.is_empty() {
                None
              } else {
                Some((path.clone(), fill))
              }
            })
            .collect::<Vec<_>>()
        })
      })
      .collect();
    for handle in handles {
      if let Ok(part) = handle.join() {
        fills.extend(part);
      }
    }
  });

  if fills.is_empty() {
    return;
  }
  let _ = db::update_meta_fill_batch(conn, &fills);
  for (path, fill) in fills {
    emit_thumb_ready(
      app,
      &path,
      None,
      None,
      fill.capture_at,
      fill.camera,
      None,
      None,
      None,
    );
  }
}

/// 缩略图后是否还有 meta / 尺寸 / Live 代理待办（已就绪则整段跳过）
fn has_post_thumb_work(conn: &rusqlite::Connection, root: &str) -> bool {
  db::has_missing_meta(conn, root).unwrap_or(false)
    || db::has_missing_image_dimensions(conn, root).unwrap_or(false)
    || db::has_live_missing_playback(conn, root).unwrap_or(false)
}

/// 对「已有缩略图但缺元数据」的行回填
fn backfill_missing_meta(app: &AppHandle, conn: &rusqlite::Connection, root: &str) {
  let Ok(paths) = db::list_paths_missing_meta(conn, root) else {
    return;
  };
  const BATCH: usize = 64;
  for chunk in paths.chunks(BATCH) {
    persist_meta_for_paths(app, conn, chunk);
  }
  backfill_missing_image_dimensions(app, conn, root);
}

/// 非视频缺尺寸：轻量 `image_dimensions` + 批量写库
fn backfill_missing_image_dimensions(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  root: &str,
) {
  let Ok(paths) = db::list_paths_missing_image_dimensions(conn, root) else {
    return;
  };
  let mut updates: Vec<(String, u32, u32)> = Vec::new();
  for path in paths {
    let Ok((w, h)) = image::image_dimensions(std::path::Path::new(&path)) else {
      continue;
    };
    if w == 0 || h == 0 {
      continue;
    }
    updates.push((path, w, h));
  }
  if updates.is_empty() {
    return;
  }
  let _ = db::update_dimensions_batch(conn, &updates);
  for (path, w, h) in updates {
    emit_thumb_ready(app, &path, None, None, None, None, Some(w), Some(h), None);
  }
}

/// 收集需预热播放代理的 Live：(still_path, mov_path)
fn live_proxy_jobs(conn: &rusqlite::Connection, root: &str) -> Vec<(String, String)> {
  db::list_live_missing_playback(conn, root).unwrap_or_default()
}

/// 为单个 mov 生成或复用 `_play.mp4` 代理路径
fn ensure_live_proxy_file(
  ffmpeg_bin: Option<&Path>,
  cache_dir: &Path,
  mov_path: &str,
) -> Option<String> {
  if let Some(cached) = thumbnail::probe_playback_cache(cache_dir, mov_path) {
    return Some(cached);
  }
  let ffmpeg = ffmpeg_bin?;
  let mov = Path::new(mov_path);
  let modified = std::fs::metadata(mov)
    .ok()
    .and_then(|m| m.modified().ok())
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);
  let cache_file = thumbnail::playback_cache_file(cache_dir, mov_path, modified);
  let partial = cache_file.with_extension("mp4.partial");
  if !ffmpeg::transcode_for_web_playback(ffmpeg, mov, &partial) {
    let _ = std::fs::remove_file(&partial);
    return None;
  }
  if !partial.is_file() {
    return None;
  }
  if cache_file.is_file() {
    let _ = std::fs::remove_file(&cache_file);
  }
  if std::fs::rename(&partial, &cache_file).is_err() {
    let _ = std::fs::remove_file(&partial);
    return None;
  }
  Some(cache_file.to_string_lossy().into_owned())
}

/// Live mov 扫描期预热 H.264 代理（限并发；单独视频仍懒转码）
fn prewarm_live_playback(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  root: &str,
  cache_dir: &Path,
  ffmpeg_bin: Option<&Path>,
  cancel: &ScanCancelToken,
  still_current: &(dyn Fn() -> bool + Sync),
) {
  let jobs = live_proxy_jobs(conn, root);
  if jobs.is_empty() {
    return;
  }
  let total = u32::try_from(jobs.len()).unwrap_or(u32::MAX);
  if still_current() {
    emit_scan_progress(app, "live-proxy", 0, total);
  }

  let parallelism = LIVE_PROXY_PARALLEL.min(jobs.len()).max(1);
  let chunk_size = jobs.len().div_ceil(parallelism);
  let done_counter = AtomicU32::new(0);
  let done_ref = &done_counter;
  // (still_path, mov_path, proxy_path)
  let mut outcomes: Vec<(String, String, String)> = Vec::new();

  std::thread::scope(|s| {
    let handles: Vec<_> = jobs
      .chunks(chunk_size)
      .map(|chunk| {
        let token = cancel.clone();
        let app_progress = app.clone();
        // done_ref / still_current 为 Copy 引用，可安全进多路 move 闭包
        s.spawn(move || {
          let mut ok: Vec<(String, String, String)> = Vec::new();
          for (still_path, mov_path) in chunk {
            if token.is_cancelled() {
              break;
            }
            if let Some(proxy) = ensure_live_proxy_file(ffmpeg_bin, cache_dir, mov_path) {
              ok.push((still_path.clone(), mov_path.clone(), proxy));
            }
            // 每完成一条就推进度（与缩略图一致），避免并行后只在首尾跳动
            let done = done_ref.fetch_add(1, Ordering::Relaxed) + 1;
            if still_current() {
              emit_scan_progress(&app_progress, "live-proxy", done, total);
            }
          }
          ok
        })
      })
      .collect();
    for handle in handles {
      outcomes.extend(handle.join().unwrap_or_default());
    }
  });

  if !still_current() || cancel.is_cancelled() {
    return;
  }

  let playback_batch: Vec<(String, String)> = outcomes
    .iter()
    .map(|(_, mov, proxy)| (mov.clone(), proxy.clone()))
    .collect();
  let _ = db::update_playback_path_batch(conn, &playback_batch);

  for (still_path, _, proxy) in &outcomes {
    emit_thumb_ready(
      app,
      still_path,
      None,
      None,
      None,
      None,
      None,
      None,
      Some(proxy.clone()),
    );
  }
  if still_current() {
    emit_scan_progress(app, "live-proxy", total, total);
  }
}

/// 支持的图片扩展名
const IMAGE_EXTS: &[&str] = &[
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "tif", "svg", "avif",
];

/// 支持的视频扩展名
const VIDEO_EXTS: &[&str] = &[
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "mpeg", "mpg",
];

pub(crate) const SKIP_DIRS: &[&str] = &[
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

/// 一次性读取文件大小与修改时间（合并单次 metadata 系统调用，避免每文件两次 syscall）
fn file_meta(path: &Path) -> (u64, i64) {
  match std::fs::metadata(path) {
    Ok(m) => (
      m.len(),
      m.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0),
    ),
    Err(_) => (0, 0),
  }
}

fn file_stem_lower(name: &str) -> String {
  Path::new(name)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("")
    .to_lowercase()
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
  /// 去扩展名后的完整 stem（小写）；同步/非同步同一规则
  stem: String,
}

/// 全 stem 匹配：完全相同，或 mov 去掉 `_hevc` / `_heic` / `_mov` 后与静帧相同
fn live_stems_match(image_stem: &str, mov_stem: &str) -> bool {
  if image_stem == mov_stem {
    return true;
  }
  mov_stem_to_image_stem(mov_stem) == image_stem
}

/**
 * 同目录 Live 配对：统一按去扩展名后的完整文件名 stem（同步与非同步相同）
 * @note 同步落盘 still/mov 共享 `{unix}_{apple8}_{id16}` stem，自然成对
 */
pub(crate) fn pair_live_photos(files: &mut Vec<MediaFile>) {
  let mov_candidates: Vec<MovCandidate> = files
    .iter()
    .filter(|f| f.ext == "mov")
    .map(|f| MovCandidate {
      path: f.path.clone(),
      stem: file_stem_lower(&f.name),
    })
    .collect();

  let mut consumed_movs: HashSet<String> = HashSet::new();

  for file in files.iter_mut() {
    if file.kind != MediaKind::Image {
      continue;
    }
    let image_stem = file_stem_lower(&file.name);

    let matched_mov = mov_candidates
      .iter()
      .filter(|m| !consumed_movs.contains(&m.path))
      .find(|m| live_stems_match(&image_stem, &m.stem));

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
  let cache_dir = cache_dir_for(album_dir);

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
    let (size, modified) = file_meta(path);

    let mut thumb_path = None;
    let mut preview_path = None;
    let mut playback_path = None;
    let mut capture_at = None;
    let mut camera = None;
    let mut width = None;
    let mut height = None;
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
        if row
          .playback_path
          .as_ref()
          .is_some_and(|p| Path::new(p).is_file())
        {
          playback_path = row.playback_path.clone();
        }
        capture_at = row
          .capture_at
          .as_ref()
          .filter(|s| !s.trim().is_empty())
          .cloned();
        camera = row
          .camera
          .as_ref()
          .filter(|s| !s.trim().is_empty())
          .cloned();
        width = row.width.filter(|&v| v > 0);
        height = row.height.filter(|&v| v > 0);
      }
    }

    if playback_path.is_none() && is_video(&ext) {
      playback_path = thumbnail::probe_playback_cache(&cache_dir, &file_path);
    }

    // 小图优化：< 100KB 且浏览器可原生显示的栅格图片，直接用原图当缩略图
    // 跳过 webp 编码开销；HEIC 浏览器不支持必须转码；视频无法当缩略图必须抽帧
    const SMALL_FILE_BYTES: u64 = 100 * 1024;
    if thumb_path.is_none()
      && size < SMALL_FILE_BYTES
      && is_image(&ext)
      && !matches!(ext.as_str(), "heic" | "heif")
    {
      thumb_path = Some(file_path.clone());
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
      playback_path,
      video_path: None,
      capture_at,
      camera,
      width,
      height,
    });
    discovered += 1;
    if discovered % 20 == 0 {
      emit_scan_progress(app, "discover", discovered, 0);
    }
  }

  emit_scan_progress(app, "discover", discovered, discovered);

  for files in dir_map.values_mut() {
    pair_live_photos(files);
    for file in files.iter_mut() {
      if file.kind == MediaKind::LivePhoto {
        if file.playback_path.is_none() {
          if let Some(ref mov_path) = file.video_path {
            file.playback_path = thumbnail::probe_playback_cache(&cache_dir, mov_path);
          }
        }
      }
    }
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

  db::sync_media_index(&conn, album_dir, root, &groups, &alive_paths)?;

  Ok(groups)
}

/// 第二阶段：后台生成缺失缩略图，逐条推送事件
/// `pipeline_epoch` / `my_epoch`：被新扫描取代后立刻停止写库与 emit，避免超时残留任务污染
pub fn run_thumbnail_pipeline(
  app: AppHandle,
  root: String,
  album_dir: PathBuf,
  thumb_size: u32,
  ffmpeg_bin: Option<PathBuf>,
  groups: Vec<MediaGroup>,
  cancel: ScanCancelToken,
  pipeline_epoch: Arc<AtomicU64>,
  my_epoch: u64,
) {
  let still_current = || pipeline_epoch.load(Ordering::SeqCst) == my_epoch;

  let cache_dir = cache_dir_for(&album_dir);
  let conn = db::open_db(&album_dir).ok();
  let fail_counts = conn
    .as_ref()
    .and_then(|c| db::load_fail_counts(c, &root).ok())
    .unwrap_or_default();

  let mut pending: Vec<String> = Vec::new();
  for group in &groups {
    for file in &group.files {
      // 跳过反复失败的坏文件，避免对同一损坏文件反复解码
      if *fail_counts.get(&file.path).unwrap_or(&0) >= db::FAIL_THRESHOLD {
        continue;
      }
      let needs_thumb = file.thumb_path.is_none();
      let needs_preview =
        thumbnail::is_heif_ext(&file.ext) && file.preview_path.is_none();
      if needs_thumb || needs_preview {
        pending.push(file.path.clone());
      }
    }
  }

  let thumb_total = u32::try_from(pending.len()).unwrap_or(u32::MAX);
  if still_current() {
    emit_scan_progress(&app, "thumbnails", 0, thumb_total);
  }

  if pending.is_empty() {
    // 无待生成缩略图：仅当仍有 meta/尺寸/Live 代理缺口时才进回填管线
    if still_current() {
      if let Some(conn) = &conn {
        if has_post_thumb_work(conn, &root) {
          backfill_missing_meta(&app, conn, &root);
          prewarm_live_playback(
            &app,
            conn,
            &root,
            &cache_dir,
            ffmpeg_bin.as_deref(),
            &cancel,
            &still_current,
          );
        }
      }
    }
    return;
  }

  let done_counter = AtomicU32::new(0);
  let app_progress = app.clone();
  let epoch_for_progress = Arc::clone(&pipeline_epoch);
  let on_progress = Arc::new(move |done: u32, total: u32| {
    if epoch_for_progress.load(Ordering::SeqCst) == my_epoch {
      emit_scan_progress(&app_progress, "thumbnails", done, total);
    }
  });

  let outcomes = thumbnail::generate_thumbnails_batch_with_progress(
    &pending,
    &cache_dir,
    thumb_size,
    ffmpeg_bin.as_deref(),
    on_progress,
    &done_counter,
    &cancel,
  );

  // 分批提交缓存更新与失败标记，减少事务次数
  const BATCH: usize = 64;
  let mut update_buf: Vec<(String, Option<String>, Option<String>, Option<u32>, Option<u32>)> =
    Vec::with_capacity(BATCH);
  let mut meta_buf: Vec<String> = Vec::with_capacity(BATCH);
  let mut fail_buf: Vec<String> = Vec::with_capacity(BATCH);

  for (path, outcome) in pending.into_iter().zip(outcomes.into_iter()) {
    // 已被新扫描取代：丢弃全部写副作用（含取消前已在飞的成功结果）
    if !still_current() {
      return;
    }
    // 取消中止 ≠ 解码失败：跳过写库/计失败，避免重扫叠取消把健康文件推到 FAIL_THRESHOLD
    if outcome.cancelled {
      continue;
    }
    // thumb 或 preview 任一成功都落库+通知（HEIC 可能只写出 preview）
    if outcome.thumb_path.is_some() || outcome.preview_path.is_some() {
      let thumb_path = outcome.thumb_path.clone();
      let preview_path = outcome.preview_path.clone();
      let width = outcome.width;
      let height = outcome.height;
      update_buf.push((
        path.clone(),
        thumb_path.clone(),
        preview_path.clone(),
        width,
        height,
      ));
      meta_buf.push(path.clone());
      emit_thumb_ready(
        &app,
        &path,
        thumb_path,
        preview_path,
        None,
        None,
        width,
        height,
        None,
      );
    } else {
      // 真实生成失败：标记失败计数，下次扫描按阈值跳过
      fail_buf.push(path.clone());
      emit_thumb_ready(&app, &path, None, None, None, None, None, None, None);
    }

    let flush_updates = update_buf.len() >= BATCH;
    let flush_fails = fail_buf.len() >= BATCH;
    if flush_updates || flush_fails {
      if !still_current() {
        return;
      }
      if flush_updates {
        if let Some(conn) = &conn {
          let _ = db::update_cache_paths_batch(conn, &update_buf);
          // 缩略图（含宽高）写库后再 EXIF/sync 补空
          persist_meta_for_paths(&app, conn, &meta_buf);
        }
        update_buf.clear();
        meta_buf.clear();
      }
      if flush_fails {
        if let Some(conn) = &conn {
          for p in &fail_buf {
            let _ = db::mark_thumb_failed(conn, p);
          }
        }
        fail_buf.clear();
      }
    }
  }
  if !still_current() {
    return;
  }
  // 提交剩余批次
  if !update_buf.is_empty() {
    if let Some(conn) = &conn {
      let _ = db::update_cache_paths_batch(conn, &update_buf);
      persist_meta_for_paths(&app, conn, &meta_buf);
    }
  }
  if !fail_buf.is_empty() {
    if let Some(conn) = &conn {
      for p in &fail_buf {
        let _ = db::mark_thumb_failed(conn, p);
      }
    }
  }
  // 已有缩略图缺 meta/尺寸 + Live 播放代理预热（无缺口则跳过）
  if still_current() {
    if let Some(conn) = &conn {
      if has_post_thumb_work(conn, &root) {
        backfill_missing_meta(&app, conn, &root);
        prewarm_live_playback(
          &app,
          conn,
          &root,
          &cache_dir,
          ffmpeg_bin.as_deref(),
          &cancel,
          &still_current,
        );
      }
    }
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
      playback_path: None,
      video_path: None,
      capture_at: None,
      camera: None,
      width: None,
      height: None,
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
      playback_path: None,
      video_path: None,
      capture_at: None,
      camera: None,
      width: None,
      height: None,
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
  fn pair_unmigrated_index_names_via_hevc_stem_rule() {
    // 全 stem + _HEVC 归一（与是否同步落盘无关）
    let mut files = vec![
      image_file("00003_IMG_0027.HEIC"),
      mov_file("00003_IMG_0027_HEVC.MOV"),
    ];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn pair_sync_format_by_shared_full_stem() {
    use crate::icloud_sync::naming::sync_asset_filename;
    use crate::icloud_sync::types::AssetPart;
    let still = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "user@icloud.com",
      "LIVE1",
      "x.HEIC",
      AssetPart::Still,
    );
    let mov = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "user@icloud.com",
      "LIVE1",
      "x.HEIC",
      AssetPart::Mov,
    );
    let mut files = vec![image_file(&still), mov_file(&mov)];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::LivePhoto);
  }

  #[test]
  fn different_sync_stems_do_not_pair() {
    use crate::icloud_sync::naming::sync_asset_filename;
    use crate::icloud_sync::types::AssetPart;
    let still = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "user@icloud.com",
      "PHOTO_A",
      "a.HEIC",
      AssetPart::Still,
    );
    let mov = sync_asset_filename(
      Some("2024-01-15T12:30:45Z"),
      "user@icloud.com",
      "CLIP_B",
      "b.HEIC",
      AssetPart::Mov,
    );
    let mut files = vec![image_file(&still), mov_file(&mov)];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].kind, MediaKind::Image);
    assert_eq!(files[1].kind, MediaKind::Video);
  }

  #[test]
  fn standalone_mov_stays_as_video() {
    let mut files = vec![mov_file("00004_clip.MOV")];
    pair_live_photos(&mut files);
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].kind, MediaKind::Video);
  }
}
