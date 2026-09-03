//! 本地重复检测：应用 iCloud 同步落盘 vs 旧 icloudpd / 同步目录内旧命名副本
//! 职责：按 content_key 匹配正本（sync dest_path）与可删 legacy；Live 按一张实况成组
//! 适用：`album_find_local_duplicates`、清理重复弹窗

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use walkdir::WalkDir;

use crate::icloud_sync::{
  is_legacy_sync_filename, is_new_format_sync_filename, list_synced_local_rows,
  resolve_sync_output_dir, strip_sync_filename_stem_prefix,
};

use super::types::{DuplicateFileSide, DuplicateGroup, DuplicateLegacyItem, ALBUM_CACHE_VERSION};
use super::scanner::{pair_live_photos, SKIP_DIRS};
use super::types::{MediaFile, MediaKind};
use super::{db, ffmpeg, settings, thumbnail};

const IMAGE_EXTS: &[&str] = &[
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "tif", "svg", "avif",
];

const VIDEO_EXTS: &[&str] = &[
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "mpeg", "mpg",
];

/// 文件名 stem 归一为匹配键：去同步落盘的 index/id8 前缀、小写
fn content_key_from_stem(stem: &str) -> String {
  strip_sync_filename_stem_prefix(stem)
}

fn content_key_from_filename(name: &str) -> String {
  let stem = Path::new(name)
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or(name);
  content_key_from_stem(stem)
}

fn normalize_path_key(path: &str) -> String {
  path.replace('\\', "/").to_lowercase()
}

fn path_is_under(path: &Path, ancestor: &Path) -> bool {
  let p = normalize_path_key(&path.to_string_lossy());
  let a = normalize_path_key(&ancestor.to_string_lossy());
  if p == a {
    return true;
  }
  if !p.starts_with(&a) {
    return false;
  }
  p.as_bytes()
    .get(a.len())
    .is_some_and(|b| *b == b'/' || *b == b'\\')
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

/// 同步库中的一张逻辑资产（Live 聚合 still+mov）
#[derive(Clone)]
struct CanonicalAsset {
  asset_id: String,
  media_kind: String,
  content_key: String,
  still_path: Option<String>,
  mov_path: Option<String>,
  display_name: String,
}

struct LegacyAsset {
  path: String,
  name: String,
  ext: String,
  video_path: Option<String>,
}

fn sync_media_kind_label(kind: &str) -> &str {
  match kind {
    "video" => "video",
    "live" => "live",
    _ => "photo",
  }
}

fn to_duplicate_side(entry: &LegacyAsset) -> DuplicateFileSide {
  DuplicateFileSide {
    path: entry.path.clone(),
    name: entry.name.clone(),
    ext: entry.ext.clone(),
    video_path: entry.video_path.clone(),
    thumb_path: None,
  }
}

fn incomplete_note(
  media_kind: &str,
  canonical_still: bool,
  canonical_mov: bool,
  legacy_still: bool,
  legacy_mov: bool,
) -> Option<String> {
  if media_kind != "live" {
    return None;
  }
  let canonical_full = canonical_still && canonical_mov;
  let legacy_full = legacy_still && legacy_mov;
  if canonical_full && legacy_full {
    return None;
  }
  if !canonical_mov && legacy_mov {
    return Some("应用侧缺配对视频".into());
  }
  if canonical_mov && !legacy_mov {
    return Some("旧下载缺配对视频".into());
  }
  if !canonical_still && legacy_still {
    return Some("应用侧仅视频轨".into());
  }
  if canonical_still && !legacy_still {
    return Some("旧下载仅视频轨".into());
  }
  Some("Live 配对不完整".into())
}

fn load_canonical_assets(app: &AppHandle) -> Result<(HashSet<String>, Vec<CanonicalAsset>), String> {
  let rows = list_synced_local_rows(app)?;

  let mut by_asset: HashMap<String, CanonicalAsset> = HashMap::new();
  let mut canonical_paths: HashSet<String> = HashSet::new();

  for row in rows {
    let dest = row.dest_path.trim().to_string();
    if dest.is_empty() || !Path::new(&dest).is_file() {
      continue;
    }
    canonical_paths.insert(normalize_path_key(&dest));

    let part = row.part.as_str();
    let media_kind = row.media_kind.as_str();

    let entry = by_asset
      .entry(row.asset_id.clone())
      .or_insert_with(|| {
        let content_key = content_key_from_filename(&row.original_filename);
        CanonicalAsset {
          asset_id: row.asset_id.clone(),
          media_kind: media_kind.to_string(),
          content_key,
          still_path: None,
          mov_path: None,
          display_name: row.original_filename.clone(),
        }
      });

    match part {
      "still" | "full" => {
        entry.still_path = Some(dest);
        if part == "still" {
          entry.display_name = row.original_filename.clone();
          entry.content_key = content_key_from_filename(&row.original_filename);
        }
      }
      "mov" => {
        entry.mov_path = Some(dest);
      }
      _ => {}
    }
    if media_kind == "live" {
      entry.media_kind = "live".to_string();
    }
  }

  Ok((canonical_paths, by_asset.into_values().collect()))
}

fn scan_legacy_assets(
  root: &Path,
  sync_output: &Path,
  canonical_paths: &HashSet<String>,
) -> HashMap<String, Vec<LegacyAsset>> {
  let mut dir_map: HashMap<PathBuf, Vec<MediaFile>> = HashMap::new();

  for entry in WalkDir::new(root)
    .min_depth(1)
    .into_iter()
    .filter_entry(|e| {
      if e.file_type().is_dir() {
        let path = e.path();
        if path_is_under(path, sync_output) {
          return false;
        }
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
    if path_is_under(path, sync_output) {
      continue;
    }
    let path_key = normalize_path_key(&path.to_string_lossy());
    if canonical_paths.contains(&path_key) {
      continue;
    }

    let ext = get_ext(path);
    if !is_image(&ext) && !is_video(&ext) {
      continue;
    }

    let parent = entry.path().parent().unwrap_or(root).to_path_buf();
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_string();
    let file_path = path.to_string_lossy().to_string();

    dir_map.entry(parent).or_default().push(MediaFile {
      path: file_path,
      name,
      kind: if is_image(&ext) {
        MediaKind::Image
      } else {
        MediaKind::Video
      },
      size: 0,
      modified: 0,
      ext,
      thumb_path: None,
      preview_path: None,
      playback_path: None,
      video_path: None,
    });
  }

  let mut index: HashMap<String, Vec<LegacyAsset>> = HashMap::new();

  for mut files in dir_map.into_values() {
    pair_live_photos(&mut files);
    for file in files {
      if canonical_paths.contains(&normalize_path_key(&file.path)) {
        continue;
      }
      if let Some(ref vp) = file.video_path {
        if canonical_paths.contains(&normalize_path_key(vp)) {
          // still 可匹配，mov 已是正本时仍保留 still 侧 legacy
        }
      }

      let key = content_key_from_filename(&file.name);
      if key.is_empty() {
        continue;
      }
      index.entry(key).or_default().push(LegacyAsset {
        path: file.path,
        name: file.name,
        ext: file.ext,
        video_path: file.video_path,
      });
    }
  }

  index
}

/// 同步目录内旧命名文件：DB 已有新格式正本且 content_key（stem）一致时可删
fn scan_sync_dir_legacy_orphans(
  sync_output: &Path,
  canonical_paths: &HashSet<String>,
  canonical_assets: &[CanonicalAsset],
) -> Vec<(CanonicalAsset, LegacyAsset)> {
  if !sync_output.is_dir() {
    return Vec::new();
  }

  let mut canonical_by_key: HashMap<String, CanonicalAsset> = HashMap::new();
  for asset in canonical_assets {
    let Some(path) = asset
      .still_path
      .as_deref()
      .or(asset.mov_path.as_deref())
    else {
      continue;
    };
    if !Path::new(path).is_file() || !is_new_format_sync_filename(path) {
      continue;
    }
    canonical_by_key
      .entry(asset.content_key.clone())
      .or_insert_with(|| asset.clone());
  }

  if canonical_by_key.is_empty() {
    return Vec::new();
  }

  let mut dir_files: Vec<MediaFile> = Vec::new();
  for entry in WalkDir::new(sync_output)
    .min_depth(1)
    .max_depth(1)
    .into_iter()
    .filter_map(|e| e.ok())
  {
    if !entry.file_type().is_file() {
      continue;
    }
    let path = entry.path();
    let path_key = normalize_path_key(&path.to_string_lossy());
    if canonical_paths.contains(&path_key) {
      continue;
    }
    let name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or_default()
      .to_string();
    if !is_legacy_sync_filename(&name) {
      continue;
    }
    let ext = get_ext(path);
    if !is_image(&ext) && !is_video(&ext) {
      continue;
    }
    dir_files.push(MediaFile {
      path: path.to_string_lossy().to_string(),
      name,
      kind: if is_image(&ext) {
        MediaKind::Image
      } else {
        MediaKind::Video
      },
      size: 0,
      modified: 0,
      ext,
      thumb_path: None,
      preview_path: None,
      playback_path: None,
      video_path: None,
    });
  }

  pair_live_photos(&mut dir_files);

  let mut out: Vec<(CanonicalAsset, LegacyAsset)> = Vec::new();
  let mut used_legacy: HashSet<String> = HashSet::new();

  for file in dir_files {
    let legacy_key = normalize_path_key(&file.path);
    if used_legacy.contains(&legacy_key) {
      continue;
    }
    let key = content_key_from_filename(&file.name);
    let Some(canonical) = canonical_by_key.get(&key).cloned() else {
      continue;
    };
    let legacy = LegacyAsset {
      path: file.path,
      name: file.name,
      ext: file.ext,
      video_path: file.video_path,
    };
    if overlaps_canonical(&legacy, canonical_paths) {
      continue;
    }
    used_legacy.insert(legacy_key);
    out.push((canonical, legacy));
  }

  out
}

fn canonical_to_side(asset: &CanonicalAsset) -> DuplicateFileSide {
  let path = asset
    .still_path
    .clone()
    .or_else(|| asset.mov_path.clone())
    .unwrap_or_default();
  let name = asset.display_name.clone();
  let ext = Path::new(&name)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("")
    .to_lowercase();
  DuplicateFileSide {
    path,
    name,
    ext,
    video_path: asset.mov_path.clone(),
    thumb_path: None,
  }
}

fn legacy_paths_set(entry: &LegacyAsset) -> HashSet<String> {
  let mut set = HashSet::new();
  set.insert(normalize_path_key(&entry.path));
  if let Some(ref vp) = entry.video_path {
    set.insert(normalize_path_key(vp));
  }
  set
}

fn overlaps_canonical(entry: &LegacyAsset, canonical_paths: &HashSet<String>) -> bool {
  legacy_paths_set(entry)
    .iter()
    .any(|p| canonical_paths.contains(p))
}

/// 解析 UI 缩略图：media.db 缓存优先，缺失时对 HEIC/视频按需生成 WebP
fn resolve_display_thumb(app: &AppHandle, path: &str) -> Option<String> {
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
  // 浏览器可直接显示的栅格图，小文件可复用原图
  if is_image(&ext) && !matches!(ext.as_str(), "heic" | "heif") {
    return Some(path.to_string());
  }

  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{ALBUM_CACHE_VERSION}"));
  let ffmpeg_bin = ffmpeg::resolve_ffmpeg_binary(app);
  let outcome = thumbnail::generate_thumbnail(path, &cache_dir, 158, ffmpeg_bin.as_deref());
  // 与 scan pipeline 一致：生成成功后写回 media.db（须已有索引行，否则 UPDATE 无影响）
  if outcome.thumb_path.is_some() || outcome.preview_path.is_some() {
    let _ = db::update_cache_paths_batch(
      &conn,
      &[(
        path.to_string(),
        outcome.thumb_path.clone(),
        outcome.preview_path.clone(),
      )],
    );
  }
  outcome.thumb_path.or(outcome.preview_path)
}

fn enrich_side_thumb(app: &AppHandle, side: &mut DuplicateFileSide) {
  if let Some(thumb) = resolve_display_thumb(app, &side.path) {
    side.thumb_path = Some(thumb);
  }
}

fn enrich_group_thumbs(app: &AppHandle, group: &mut DuplicateGroup) {
  enrich_side_thumb(app, &mut group.canonical);
  for item in &mut group.duplicates {
    enrich_side_thumb(app, &mut item.duplicate);
  }
}

struct GroupBuilder {
  content_key: String,
  media_kind: String,
  asset_id: String,
  canonical: DuplicateFileSide,
  duplicates: Vec<DuplicateLegacyItem>,
}

/// 向分组追加一个 legacy 副本；已占用或非法则跳过
fn try_push_legacy_duplicate(
  groups: &mut HashMap<String, GroupBuilder>,
  asset: &CanonicalAsset,
  legacy: &LegacyAsset,
  canonical_paths: &HashSet<String>,
  used_legacy: &mut HashSet<String>,
) {
  let legacy_key = normalize_path_key(&legacy.path);
  if used_legacy.contains(&legacy_key) {
    return;
  }
  if overlaps_canonical(legacy, canonical_paths) {
    return;
  }
  let canonical_side = canonical_to_side(asset);
  if canonical_side.path.is_empty() {
    return;
  }
  if normalize_path_key(&legacy.path) == normalize_path_key(&canonical_side.path) {
    return;
  }

  let note = incomplete_note(
    &asset.media_kind,
    asset.still_path.is_some(),
    asset.mov_path.is_some(),
    true,
    legacy.video_path.is_some(),
  );

  let builder = groups
    .entry(asset.asset_id.clone())
    .or_insert_with(|| GroupBuilder {
      content_key: asset.content_key.clone(),
      media_kind: sync_media_kind_label(&asset.media_kind).to_string(),
      asset_id: asset.asset_id.clone(),
      canonical: canonical_side,
      duplicates: Vec::new(),
    });

  builder.duplicates.push(DuplicateLegacyItem {
    duplicate: to_duplicate_side(legacy),
    incomplete: note.is_some(),
    incomplete_note: note,
  });
  used_legacy.insert(legacy_key);
}

/// 扫描相册根目录，找出 sync 正本与 legacy 重复组（一正本多副本）
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

  let sync_output = resolve_sync_output_dir(app)?;
  let sync_output = sync_output.unwrap_or_else(|| root_path.join("iCloudSync"));

  let (canonical_paths, canonical_assets) = load_canonical_assets(app)?;
  if canonical_assets.is_empty() {
    return Ok(Vec::new());
  }

  let legacy_index = scan_legacy_assets(&root_path, &sync_output, &canonical_paths);
  let sync_orphans =
    scan_sync_dir_legacy_orphans(&sync_output, &canonical_paths, &canonical_assets);

  let mut stem_counts: HashMap<String, usize> = HashMap::new();
  for asset in &canonical_assets {
    *stem_counts
      .entry(asset.content_key.clone())
      .or_insert(0) += 1;
  }

  let mut groups: HashMap<String, GroupBuilder> = HashMap::new();
  let mut used_legacy: HashSet<String> = HashSet::new();

  for (asset, legacy) in sync_orphans {
    try_push_legacy_duplicate(
      &mut groups,
      &asset,
      &legacy,
      &canonical_paths,
      &mut used_legacy,
    );
  }

  for asset in &canonical_assets {
    let Some(candidates) = legacy_index.get(&asset.content_key) else {
      continue;
    };
    for legacy in candidates {
      try_push_legacy_duplicate(
        &mut groups,
        asset,
        legacy,
        &canonical_paths,
        &mut used_legacy,
      );
    }
  }

  let mut result: Vec<DuplicateGroup> = groups
    .into_values()
    .filter(|g| !g.duplicates.is_empty())
    .map(|g| DuplicateGroup {
      ambiguous_stem: stem_counts.get(&g.content_key).copied().unwrap_or(0) > 1,
      content_key: g.content_key,
      media_kind: g.media_kind,
      asset_id: g.asset_id,
      canonical: g.canonical,
      duplicates: g.duplicates,
    })
    .collect();

  result.sort_by(|a, b| {
    a.content_key
      .cmp(&b.content_key)
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

  #[test]
  fn content_key_strips_index_prefix() {
    assert_eq!(content_key_from_filename("00042_IMG_0027.HEIC"), "img_0027");
    assert_eq!(content_key_from_filename("IMG_0027.HEIC"), "img_0027");
  }

  #[test]
  fn path_is_under_windows_style() {
    let root = PathBuf::from(r"E:\Photos\iCloudSync");
    assert!(path_is_under(
      Path::new(r"E:\Photos\iCloudSync\00001_x.heic"),
      &root
    ));
    assert!(!path_is_under(
      Path::new(r"E:\Photos\iCloudSyncBackup\x.heic"),
      &root
    ));
  }
}
