//! 本地重复检测：相册根全量扫盘，按稳定内容哈希归组，组内落库优先正本
//! 职责：同 size 预筛后懒算 BLAKE3（读/写 media.db）；不再以文件名 stem 为主键；
//!       Live 仍成对，主文件哈希相同成组，再比 mov 哈希定置信度
//! 适用：`album_find_local_duplicates`、清理重复弹窗

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::icloud_sync::list_synced_local_rows;

use super::scanner::{pair_live_photos, SKIP_DIRS};
use super::types::{
  DuplicateFileSide, DuplicateGroup, DuplicateLegacyItem, DuplicateMatchConfidence, MediaFile,
  MediaKind, ALBUM_CACHE_VERSION,
};
use super::{db, ffmpeg, settings, thumbnail};

const IMAGE_EXTS: &[&str] = &[
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "tif", "svg", "avif",
];

const VIDEO_EXTS: &[&str] = &[
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "mpeg", "mpg",
];

/// sync 库落库元数据（按 dest_path 索引）
struct DbPathMeta {
  asset_id: String,
  original_filename: String,
  media_kind: String,
  /// still / mov / full；展示原名优先取 still
  part: String,
}

/// 全量扫盘后的一条逻辑媒体（Live 已成对）
#[derive(Clone)]
struct ScannedEntry {
  path: String,
  name: String,
  ext: String,
  video_path: Option<String>,
  /// 展示用键（文件名 stem）；归组改用 content_hash
  display_key: String,
  asset_id: Option<String>,
  in_db: bool,
  media_kind: String,
  size: u64,
  modified: i64,
  /// 主文件 BLAKE3；仅同 size 候选会填充
  content_hash: Option<String>,
  /// Live mov BLAKE3
  mov_hash: Option<String>,
  mov_size: u64,
  mov_modified: i64,
}

fn content_key_from_filename(name: &str) -> String {
  let stem = Path::new(name)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or(name);
  stem.to_lowercase()
}

fn normalize_path_key(path: &str) -> String {
  path.replace('\\', "/").to_lowercase()
}

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

fn path_meta(path: &Path) -> (u64, i64) {
  match std::fs::metadata(path) {
    Ok(m) => {
      let size = m.len();
      let modified = m
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
      (size, modified)
    }
    Err(_) => (0, 0),
  }
}

/**
 * 取或算路径内容指纹，并尽量写回 media.db
 * @note 库无该行时仅内存使用，不强制插入索引
 */
fn ensure_content_hash(
  conn: Option<&Connection>,
  path: &str,
  size: u64,
  modified: i64,
) -> Option<String> {
  if path.trim().is_empty() || size == 0 {
    return None;
  }
  if let Some(conn) = conn {
    if let Ok(Some(cached)) = db::load_valid_content_hash(conn, path, size, modified) {
      return Some(cached);
    }
  }
  let hash = db::compute_blake3_hex(path)?;
  if let Some(conn) = conn {
    let _ = db::save_content_hash(conn, path, &hash, size, modified);
  }
  Some(hash)
}

fn load_db_path_meta(app: &AppHandle) -> Result<HashMap<String, DbPathMeta>, String> {
  let rows = list_synced_local_rows(app)?;
  let mut map = HashMap::new();
  for row in rows {
    let dest = row.dest_path.trim();
    if dest.is_empty() {
      continue;
    }
    map.insert(
      normalize_path_key(dest),
      DbPathMeta {
        asset_id: row.asset_id,
        original_filename: row.original_filename,
        media_kind: row.media_kind,
        part: row.part,
      },
    );
  }
  Ok(map)
}

/// 相册根全量扫媒体（含 sync 落盘目录）；同目录 Live 成对
fn scan_all_media(root: &Path) -> Vec<MediaFile> {
  let mut dir_map: HashMap<PathBuf, Vec<MediaFile>> = HashMap::new();

  for entry in WalkDir::new(root)
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

    let parent = path.parent().unwrap_or(root).to_path_buf();
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_string();
    let file_path = path.to_string_lossy().to_string();
    let (size, modified) = path_meta(path);

    dir_map.entry(parent).or_default().push(MediaFile {
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
      thumb_path: None,
      preview_path: None,
      playback_path: None,
      video_path: None,
      capture_at: None,
      camera: None,
      width: None,
      height: None,
    });
  }

  let mut out = Vec::new();
  for mut files in dir_map.into_values() {
    pair_live_photos(&mut files);
    out.extend(files);
  }
  out
}

fn media_kind_label(kind: &MediaKind, db_kind: Option<&str>, has_video: bool) -> String {
  if has_video || db_kind == Some("live") {
    return "live".into();
  }
  if db_kind == Some("video") || matches!(kind, MediaKind::Video) {
    return "video".into();
  }
  "photo".into()
}

fn build_scanned_entries(
  files: Vec<MediaFile>,
  db_meta: &HashMap<String, DbPathMeta>,
) -> Vec<ScannedEntry> {
  let mut entries = Vec::with_capacity(files.len());
  let mut seen_paths: HashSet<String> = HashSet::new();

  for file in files {
    let path_key = normalize_path_key(&file.path);
    if !seen_paths.insert(path_key.clone()) {
      continue;
    }
    if let Some(ref vp) = file.video_path {
      seen_paths.insert(normalize_path_key(vp));
    }

    let still_meta = db_meta.get(&path_key);
    let mov_meta = file
      .video_path
      .as_ref()
      .and_then(|vp| db_meta.get(&normalize_path_key(vp)));

    let in_db = still_meta.is_some() || mov_meta.is_some();
    // 展示原名：优先 still/full 行，避免 mov 行文件名干扰
    let name_meta = still_meta
      .filter(|m| m.part != "mov")
      .or(still_meta)
      .or(mov_meta);
    let asset_id = name_meta.map(|m| m.asset_id.clone());
    let db_kind = name_meta.map(|m| m.media_kind.as_str());

    let display_key = if let Some(meta) = name_meta {
      let key = content_key_from_filename(&meta.original_filename);
      if key.is_empty() {
        content_key_from_filename(&file.name)
      } else {
        key
      }
    } else {
      content_key_from_filename(&file.name)
    };

    let (mov_size, mov_modified) = file
      .video_path
      .as_ref()
      .map(|vp| path_meta(Path::new(vp)))
      .unwrap_or((0, 0));

    let has_video = file.video_path.is_some();
    entries.push(ScannedEntry {
      path: file.path,
      name: file.name,
      ext: file.ext,
      video_path: file.video_path,
      display_key,
      asset_id,
      in_db,
      media_kind: media_kind_label(&file.kind, db_kind, has_video),
      size: file.size,
      modified: file.modified,
      content_hash: None,
      mov_hash: None,
      mov_size,
      mov_modified,
    });
  }

  entries
}

/// 同主文件 size ≥2 才值得算哈希；为候选填充 content_hash / mov_hash
fn fill_hashes_for_size_candidates(conn: Option<&Connection>, entries: &mut [ScannedEntry]) {
  let mut size_counts: HashMap<u64, usize> = HashMap::new();
  for e in entries.iter() {
    if e.size > 0 {
      *size_counts.entry(e.size).or_insert(0) += 1;
    }
  }

  for entry in entries.iter_mut() {
    if entry.size == 0 || size_counts.get(&entry.size).copied().unwrap_or(0) < 2 {
      continue;
    }
    entry.content_hash = ensure_content_hash(conn, &entry.path, entry.size, entry.modified);
    if let Some(ref vp) = entry.video_path {
      if entry.mov_size > 0 {
        entry.mov_hash = ensure_content_hash(conn, vp, entry.mov_size, entry.mov_modified);
      }
    }
  }
}

/// Live 完整度排序：完整实况 > 普通图/视频 > 缺 mov 的实况（数值越大越优先）
fn live_completeness_rank(entry: &ScannedEntry) -> u8 {
  let has_mov = entry
    .video_path
    .as_ref()
    .is_some_and(|p| !p.trim().is_empty());
  if entry.media_kind == "live" {
    if has_mov {
      2
    } else {
      0
    }
  } else if has_mov {
    // 成对后仍可能 kind 未标 live，有 mov 视为完整实况
    2
  } else {
    1
  }
}

/// 组内正本：落库优先 → 完整 Live → 修改时间较新
fn pick_canonical_index(entries: &[&ScannedEntry]) -> usize {
  debug_assert!(!entries.is_empty());
  let mut best = 0usize;
  for (i, entry) in entries.iter().enumerate().skip(1) {
    let cur = entries[best];
    let better = match (entry.in_db, cur.in_db) {
      (true, false) => true,
      (false, true) => false,
      _ => {
        let e_rank = live_completeness_rank(entry);
        let c_rank = live_completeness_rank(cur);
        if e_rank != c_rank {
          e_rank > c_rank
        } else {
          entry.modified > cur.modified
            || (entry.modified == cur.modified
              && normalize_path_key(&entry.path) < normalize_path_key(&cur.path))
        }
      }
    };
    if better {
      best = i;
    }
  }
  best
}

fn to_side(entry: &ScannedEntry) -> DuplicateFileSide {
  DuplicateFileSide {
    path: entry.path.clone(),
    name: entry.name.clone(),
    ext: entry.ext.clone(),
    video_path: entry.video_path.clone(),
    thumb_path: None,
  }
}

fn local_group_id(hash: &str) -> String {
  format!("hash:{}", &hash[..hash.len().min(16)])
}

fn entry_incomplete_note(entry: &ScannedEntry) -> Option<String> {
  let has_mov = entry
    .video_path
    .as_ref()
    .is_some_and(|p| !p.trim().is_empty());
  if entry.media_kind == "live" && !has_mov {
    return Some("缺配对视频".into());
  }
  None
}

/// 同主文件哈希已成组：非 Live → High；Live 再比 mov
fn classify_vs_canonical(
  canonical: &ScannedEntry,
  other: &ScannedEntry,
) -> (DuplicateMatchConfidence, u64, u64) {
  let canonical_size = canonical.size;
  let duplicate_size = other.size;
  let is_live = canonical.media_kind == "live" || other.media_kind == "live";
  if !is_live {
    return (
      DuplicateMatchConfidence::High,
      canonical_size,
      duplicate_size,
    );
  }

  match (
    canonical.mov_hash.as_deref(),
    other.mov_hash.as_deref(),
    canonical.video_path.as_ref(),
    other.video_path.as_ref(),
  ) {
    (Some(a), Some(b), _, _) if a == b => (
      DuplicateMatchConfidence::High,
      canonical_size,
      duplicate_size,
    ),
    (None, None, None, None) => (
      DuplicateMatchConfidence::High,
      canonical_size,
      duplicate_size,
    ),
    // 一侧缺 mov 或哈希未算出：中档（主画面已相同）
    _ => (
      DuplicateMatchConfidence::Medium,
      canonical_size,
      duplicate_size,
    ),
  }
}

fn resolve_display_thumb_cached(app: &AppHandle, path: &str) -> Option<String> {
  if path.trim().is_empty() || !Path::new(path).is_file() {
    return None;
  }

  let album_data_dir = settings::album_dir(app).ok()?;
  let conn = db::open_db(&album_data_dir).ok()?;
  if let Ok((thumb, preview, _, _)) = db::get_media_companion_paths(&conn, path) {
    if thumb.as_ref().is_some_and(|p| Path::new(p).is_file()) {
      return thumb;
    }
    if preview.as_ref().is_some_and(|p| Path::new(p).is_file()) {
      return preview;
    }
  }

  let ext = get_ext(Path::new(path));
  if is_image(&ext) && !matches!(ext.as_str(), "heic" | "heif") {
    return Some(path.to_string());
  }

  None
}

/// 按需生成缩略图（弹窗内可见行 lazy 加载用）
pub fn resolve_display_thumb_on_demand(app: &AppHandle, path: &str) -> Option<String> {
  if let Some(cached) = resolve_display_thumb_cached(app, path) {
    return Some(cached);
  }

  if path.trim().is_empty() || !Path::new(path).is_file() {
    return None;
  }

  let album_data_dir = settings::album_dir(app).ok()?;
  let conn = db::open_db(&album_data_dir).ok()?;
  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{ALBUM_CACHE_VERSION}"));
  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(app);
  let outcome = thumbnail::generate_thumbnail(path, &cache_dir, 158, ffmpeg_bin.as_deref());
  if outcome.thumb_path.is_some() || outcome.preview_path.is_some() {
    let _ = db::update_cache_paths_batch(
      &conn,
      &[(
        path.to_string(),
        outcome.thumb_path.clone(),
        outcome.preview_path.clone(),
        outcome.width,
        outcome.height,
      )],
    );
  }
  outcome.thumb_path.or(outcome.preview_path)
}

fn enrich_side_thumb(app: &AppHandle, side: &mut DuplicateFileSide) {
  if let Some(thumb) = resolve_display_thumb_cached(app, &side.path) {
    side.thumb_path = Some(thumb);
  }
}

fn enrich_group_thumbs(app: &AppHandle, group: &mut DuplicateGroup) {
  enrich_side_thumb(app, &mut group.canonical);
  for item in &mut group.duplicates {
    enrich_side_thumb(app, &mut item.duplicate);
  }
}

fn confidence_sort_rank(confidence: DuplicateMatchConfidence) -> u8 {
  match confidence {
    DuplicateMatchConfidence::High => 0,
    DuplicateMatchConfidence::Medium => 1,
  }
}

fn group_best_confidence_rank(group: &DuplicateGroup) -> u8 {
  group
    .duplicates
    .iter()
    .map(|item| confidence_sort_rank(item.confidence))
    .min()
    .unwrap_or(1)
}

fn group_high_confidence_count(group: &DuplicateGroup) -> usize {
  group
    .duplicates
    .iter()
    .filter(|item| matches!(item.confidence, DuplicateMatchConfidence::High))
    .count()
}

fn build_group_from_bucket(bucket: &[&ScannedEntry], content_hash: &str) -> Option<DuplicateGroup> {
  if bucket.len() < 2 {
    return None;
  }

  let canon_idx = pick_canonical_index(bucket);
  let canonical = bucket[canon_idx];

  let mut db_asset_ids: HashSet<&str> = HashSet::new();
  for e in bucket {
    if let Some(ref id) = e.asset_id {
      db_asset_ids.insert(id.as_str());
    }
  }
  let ambiguous_stem = db_asset_ids.len() > 1;

  let mut duplicates = Vec::new();
  for (i, entry) in bucket.iter().enumerate() {
    if i == canon_idx {
      continue;
    }
    let note = entry_incomplete_note(entry);
    let (confidence, canonical_size, duplicate_size) = classify_vs_canonical(canonical, entry);
    duplicates.push(DuplicateLegacyItem {
      duplicate: to_side(entry),
      incomplete: note.is_some(),
      incomplete_note: note,
      confidence,
      canonical_size,
      duplicate_size,
    });
  }
  if duplicates.is_empty() {
    return None;
  }

  let asset_id = canonical
    .asset_id
    .clone()
    .unwrap_or_else(|| local_group_id(content_hash));

  // UI：优先展示可读原名 stem；无则截断哈希
  let content_key = if canonical.display_key.is_empty() {
    content_hash.chars().take(12).collect()
  } else {
    canonical.display_key.clone()
  };

  Some(DuplicateGroup {
    ambiguous_stem,
    content_key,
    media_kind: canonical.media_kind.clone(),
    asset_id,
    canonical: to_side(canonical),
    duplicates,
  })
}

/// 扫描相册根：size 预筛 → 懒算/读库 BLAKE3 → 按主文件哈希归组
pub fn find_local_duplicates(app: &AppHandle) -> Result<Vec<DuplicateGroup>, String> {
  let album_settings = settings::load_settings(app)?;
  let root = album_settings.root_dir.trim();
  if root.is_empty() {
    return Err("请先配置相册根目录".into());
  }
  let root_path = PathBuf::from(root);
  if !root_path.is_dir() {
    return Err(format!("相册根目录不存在: {root}"));
  }

  let db_meta = load_db_path_meta(app)?;
  let files = scan_all_media(&root_path);
  let mut entries = build_scanned_entries(files, &db_meta);
  if entries.len() < 2 {
    return Ok(Vec::new());
  }

  let album_data_dir = settings::album_dir(app).ok();
  let media_conn = album_data_dir
    .as_ref()
    .and_then(|dir| db::open_db(dir).ok());
  fill_hashes_for_size_candidates(media_conn.as_ref(), &mut entries);

  // content_hash → 条目下标
  let mut index: HashMap<String, Vec<usize>> = HashMap::new();
  for (i, entry) in entries.iter().enumerate() {
    let Some(ref hash) = entry.content_hash else {
      continue;
    };
    index.entry(hash.clone()).or_default().push(i);
  }

  let mut result: Vec<DuplicateGroup> = Vec::new();
  for (hash, idxs) in index {
    if idxs.len() < 2 {
      continue;
    }
    let bucket: Vec<&ScannedEntry> = idxs.iter().map(|&i| &entries[i]).collect();
    if let Some(group) = build_group_from_bucket(&bucket, &hash) {
      result.push(group);
    }
  }

  for group in &mut result {
    group
      .duplicates
      .sort_by_key(|item| confidence_sort_rank(item.confidence));
  }
  result.sort_by(|a, b| {
    group_best_confidence_rank(a)
      .cmp(&group_best_confidence_rank(b))
      .then_with(|| {
        let high_a = group_high_confidence_count(a);
        let high_b = group_high_confidence_count(b);
        high_b.cmp(&high_a)
      })
      .then_with(|| a.content_key.cmp(&b.content_key))
      .then_with(|| a.asset_id.cmp(&b.asset_id))
  });
  for group in &mut result {
    enrich_group_thumbs(app, group);
  }
  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn entry(
    path: &str,
    size: u64,
    hash: Option<&str>,
    in_db: bool,
    asset_id: Option<&str>,
  ) -> ScannedEntry {
    ScannedEntry {
      path: path.into(),
      name: Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .into(),
      ext: "jpg".into(),
      video_path: None,
      display_key: "img_1".into(),
      asset_id: asset_id.map(str::to_string),
      in_db,
      media_kind: "photo".into(),
      size,
      modified: if in_db { 1 } else { 99 },
      content_hash: hash.map(str::to_string),
      mov_hash: None,
      mov_size: 0,
      mov_modified: 0,
    }
  }

  #[test]
  fn pick_canonical_prefers_in_db() {
    let a = entry(r"E:\old\a.jpg", 10, Some("h"), false, None);
    let b = entry(r"E:\sync\b.jpg", 10, Some("h"), true, Some("A1"));
    assert_eq!(pick_canonical_index(&[&a, &b]), 1);
  }

  #[test]
  fn pick_canonical_prefers_complete_live_over_incomplete() {
    let incomplete = ScannedEntry {
      path: r"E:\1\x.heic".into(),
      name: "x.heic".into(),
      ext: "heic".into(),
      video_path: None,
      display_key: "x".into(),
      asset_id: None,
      in_db: false,
      media_kind: "live".into(),
      size: 10,
      modified: 999,
      content_hash: Some("h".into()),
      mov_hash: None,
      mov_size: 0,
      mov_modified: 0,
    };
    let complete = ScannedEntry {
      path: r"E:\sync\x.heic".into(),
      name: "x.heic".into(),
      ext: "heic".into(),
      video_path: Some(r"E:\sync\x.mov".into()),
      display_key: "x".into(),
      asset_id: None,
      in_db: false,
      media_kind: "live".into(),
      size: 10,
      modified: 1,
      content_hash: Some("h".into()),
      mov_hash: Some("m".into()),
      mov_size: 2,
      mov_modified: 1,
    };
    // 完整 Live 优先于「改时更新但缺 mov」
    assert_eq!(pick_canonical_index(&[&incomplete, &complete]), 1);
  }

  #[test]
  fn pick_canonical_in_db_beats_complete_live() {
    let orphan_complete = ScannedEntry {
      path: r"E:\old\x.heic".into(),
      name: "x.heic".into(),
      ext: "heic".into(),
      video_path: Some(r"E:\old\x.mov".into()),
      display_key: "x".into(),
      asset_id: None,
      in_db: false,
      media_kind: "live".into(),
      size: 10,
      modified: 999,
      content_hash: Some("h".into()),
      mov_hash: Some("m".into()),
      mov_size: 2,
      mov_modified: 1,
    };
    let db_incomplete = ScannedEntry {
      path: r"E:\sync\x.heic".into(),
      name: "x.heic".into(),
      ext: "heic".into(),
      video_path: None,
      display_key: "x".into(),
      asset_id: Some("A".into()),
      in_db: true,
      media_kind: "live".into(),
      size: 10,
      modified: 1,
      content_hash: Some("h".into()),
      mov_hash: None,
      mov_size: 0,
      mov_modified: 0,
    };
    assert_eq!(pick_canonical_index(&[&orphan_complete, &db_incomplete]), 1);
  }

  #[test]
  fn build_group_by_hash_marks_db_canonical() {
    let dir = std::env::temp_dir().join(format!("dup_hash_group_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let sync = dir.join("sync.jpg");
    let old = dir.join("IMG_1.jpg");
    std::fs::write(&sync, b"same-bytes").expect("write");
    std::fs::write(&old, b"same-bytes").expect("write");

    let sync_e = entry(
      &sync.to_string_lossy(),
      10,
      Some("abc"),
      true,
      Some("AID"),
    );
    let old_e = entry(&old.to_string_lossy(), 10, Some("abc"), false, None);

    let group = build_group_from_bucket(&[&old_e, &sync_e], "abc").expect("group");
    assert_eq!(group.asset_id, "AID");
    assert_eq!(group.canonical.path, sync_e.path);
    assert_eq!(group.duplicates.len(), 1);
    assert_eq!(group.duplicates[0].confidence, DuplicateMatchConfidence::High);

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn blake3_same_bytes_same_hex() {
    let dir = std::env::temp_dir().join(format!("dup_blake3_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let a = dir.join("a.bin");
    let b = dir.join("b.bin");
    std::fs::write(&a, b"payload-xyz").expect("write");
    std::fs::write(&b, b"payload-xyz").expect("write");

    let ha = db::compute_blake3_hex(&a.to_string_lossy()).expect("hash a");
    let hb = db::compute_blake3_hex(&b.to_string_lossy()).expect("hash b");
    assert_eq!(ha, hb);
    assert_ne!(ha, db::compute_blake3_hex(&{
      std::fs::write(dir.join("c.bin"), b"other").unwrap();
      dir.join("c.bin").to_string_lossy().into_owned()
    })
    .unwrap());

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn classify_live_mov_mismatch_is_medium() {
    let c = ScannedEntry {
      path: "a.jpg".into(),
      name: "a.jpg".into(),
      ext: "jpg".into(),
      video_path: Some("a.mov".into()),
      display_key: "a".into(),
      asset_id: None,
      in_db: true,
      media_kind: "live".into(),
      size: 1,
      modified: 0,
      content_hash: Some("h".into()),
      mov_hash: Some("m1".into()),
      mov_size: 2,
      mov_modified: 0,
    };
    let o = ScannedEntry {
      path: "b.jpg".into(),
      name: "b.jpg".into(),
      ext: "jpg".into(),
      video_path: Some("b.mov".into()),
      display_key: "b".into(),
      asset_id: None,
      in_db: false,
      media_kind: "live".into(),
      size: 1,
      modified: 0,
      content_hash: Some("h".into()),
      mov_hash: Some("m2".into()),
      mov_size: 2,
      mov_modified: 0,
    };
    let (conf, _, _) = classify_vs_canonical(&c, &o);
    assert_eq!(conf, DuplicateMatchConfidence::Medium);
  }
}
