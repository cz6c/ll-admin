//! 本地重复检测：应用 iCloud 同步落盘 vs 旧 icloudpd 等副本
//! 职责：按 content_key（original_filename / 磁盘 stem）匹配正本与可删 legacy；Live 按一张实况成组
//! 适用：`album_find_local_duplicates`、清理重复弹窗

use std::collections::{HashMap, HashSet};
use std::hash::Hasher;
use std::io::Read;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use walkdir::WalkDir;

use crate::icloud_sync::{list_synced_local_rows, resolve_sync_output_dir};

use super::types::{
  DuplicateFileSide, DuplicateGroup, DuplicateLegacyItem, DuplicateMatchConfidence,
  ALBUM_CACHE_VERSION,
};
use super::scanner::{pair_live_photos, SKIP_DIRS};
use super::types::{MediaFile, MediaKind};
use super::{db, ffmpeg, settings, thumbnail};

const IMAGE_EXTS: &[&str] = &[
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "tiff", "tif", "svg", "avif",
];

const VIDEO_EXTS: &[&str] = &[
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "3gp", "mpeg", "mpg",
];

/// 文件名 stem 归一为匹配键（小写）；正本侧通常来自库内 original_filename
fn content_key_from_stem(stem: &str) -> String {
  stem.to_lowercase()
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

fn path_file_size(path: &str) -> Option<u64> {
  let path = path.trim();
  if path.is_empty() {
    return None;
  }
  let p = Path::new(path);
  if !p.is_file() {
    return None;
  }
  std::fs::metadata(p).ok().map(|m| m.len())
}

fn paths_same_size(a: &str, b: &str) -> bool {
  match (path_file_size(a), path_file_size(b)) {
    (Some(x), Some(y)) => x == y,
    _ => false,
  }
}

/// 流式读取文件内容指纹；仅用于本地重复比对，不要求跨版本稳定
fn path_content_fingerprint(path: &str) -> Option<u64> {
  use std::collections::hash_map::DefaultHasher;

  let mut file = std::fs::File::open(path.trim()).ok()?;
  let mut hasher = DefaultHasher::new();
  let mut buf = [0u8; 65536];
  loop {
    let n = file.read(&mut buf).ok()?;
    if n == 0 {
      break;
    }
    hasher.write(&buf[..n]);
  }
  Some(hasher.finish())
}

fn paths_same_content(a: &str, b: &str) -> bool {
  match (path_content_fingerprint(a), path_content_fingerprint(b)) {
    (Some(x), Some(y)) => x == y,
    _ => false,
  }
}

fn canonical_primary_path(asset: &CanonicalAsset) -> &str {
  asset
    .still_path
    .as_deref()
    .or(asset.mov_path.as_deref())
    .unwrap_or("")
}

fn live_sizes_compatible(asset: &CanonicalAsset, legacy: &LegacyAsset) -> bool {
  let c_still = asset.still_path.as_deref().unwrap_or("");
  if !paths_same_size(c_still, &legacy.path) {
    return false;
  }
  match (asset.mov_path.as_deref(), legacy.video_path.as_deref()) {
    (Some(c), Some(l)) => paths_same_size(c, l),
    (None, None) => true,
    _ => false,
  }
}

fn live_content_matches(asset: &CanonicalAsset, legacy: &LegacyAsset) -> bool {
  let c_still = asset.still_path.as_deref().unwrap_or("");
  if !paths_same_content(c_still, &legacy.path) {
    return false;
  }
  match (asset.mov_path.as_deref(), legacy.video_path.as_deref()) {
    (Some(c), Some(l)) => paths_same_content(c, l),
    (None, None) => true,
    _ => false,
  }
}

/// 低→中→高：仅在中档（大小一致）时才读盘算哈希
fn classify_duplicate_confidence(
  asset: &CanonicalAsset,
  legacy: &LegacyAsset,
) -> (DuplicateMatchConfidence, u64, u64) {
  let duplicate_size = path_file_size(&legacy.path).unwrap_or(0);
  let canonical_size = path_file_size(canonical_primary_path(asset)).unwrap_or(0);

  let sizes_ok = if asset.media_kind == "live" {
    live_sizes_compatible(asset, legacy)
  } else {
    paths_same_size(canonical_primary_path(asset), &legacy.path)
  };

  if !sizes_ok {
    return (
      DuplicateMatchConfidence::Low,
      canonical_size,
      duplicate_size,
    );
  }

  let content_ok = if asset.media_kind == "live" {
    live_content_matches(asset, legacy)
  } else {
    paths_same_content(canonical_primary_path(asset), &legacy.path)
  };

  if content_ok {
    (
      DuplicateMatchConfidence::High,
      canonical_size,
      duplicate_size,
    )
  } else {
    (
      DuplicateMatchConfidence::Medium,
      canonical_size,
      duplicate_size,
    )
  }
}

/// 解析 UI 缩略图：仅读 media.db 缓存或浏览器可直接显示的原图；批量扫描时不触发生成
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

  let (confidence, canonical_size, duplicate_size) =
    classify_duplicate_confidence(asset, legacy);

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
    confidence,
    canonical_size,
    duplicate_size,
  });
  used_legacy.insert(legacy_key);
}

/// 置信度展示序：高 → 中 → 低（数值越小越靠前）
fn confidence_sort_rank(confidence: DuplicateMatchConfidence) -> u8 {
  match confidence {
    DuplicateMatchConfidence::High => 0,
    DuplicateMatchConfidence::Medium => 1,
    DuplicateMatchConfidence::Low => 2,
  }
}

fn group_best_confidence_rank(group: &DuplicateGroup) -> u8 {
  group
    .duplicates
    .iter()
    .map(|item| confidence_sort_rank(item.confidence))
    .min()
    .unwrap_or(2)
}

fn group_high_confidence_count(group: &DuplicateGroup) -> usize {
  group
    .duplicates
    .iter()
    .filter(|item| matches!(item.confidence, DuplicateMatchConfidence::High))
    .count()
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

  let mut stem_counts: HashMap<String, usize> = HashMap::new();
  for asset in &canonical_assets {
    *stem_counts
      .entry(asset.content_key.clone())
      .or_insert(0) += 1;
  }

  let mut groups: HashMap<String, GroupBuilder> = HashMap::new();
  let mut used_legacy: HashSet<String> = HashSet::new();

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

  // 组列表与组内副本均按置信度高→低，便于清理弹窗优先处理高置信项
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

  #[test]
  fn content_key_is_lowercase_stem() {
    assert_eq!(content_key_from_filename("IMG_0027.HEIC"), "img_0027");
    assert_eq!(content_key_from_filename("00042_IMG_0027.HEIC"), "00042_img_0027");
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

  #[test]
  fn classify_low_when_sizes_differ() {
    let dir = std::env::temp_dir().join(format!(
      "dup_conf_low_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let a = dir.join("a.bin");
    let b = dir.join("b.bin");
    std::fs::write(&a, b"aaa").expect("write");
    std::fs::write(&b, b"bbbb").expect("write");

    let asset = CanonicalAsset {
      asset_id: "A".into(),
      media_kind: "photo".into(),
      content_key: "x".into(),
      still_path: Some(a.to_string_lossy().into_owned()),
      mov_path: None,
      display_name: "x.jpg".into(),
    };
    let legacy = LegacyAsset {
      path: b.to_string_lossy().into_owned(),
      name: "b.bin".into(),
      ext: "bin".into(),
      video_path: None,
    };

    let (conf, _, _) = classify_duplicate_confidence(&asset, &legacy);
    assert_eq!(conf, DuplicateMatchConfidence::Low);

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn classify_high_when_same_size_and_content() {
    let dir = std::env::temp_dir().join(format!(
      "dup_conf_high_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let a = dir.join("a.bin");
    let b = dir.join("b.bin");
    std::fs::write(&a, b"same-bytes").expect("write");
    std::fs::write(&b, b"same-bytes").expect("write");

    let asset = CanonicalAsset {
      asset_id: "A".into(),
      media_kind: "photo".into(),
      content_key: "x".into(),
      still_path: Some(a.to_string_lossy().into_owned()),
      mov_path: None,
      display_name: "x.jpg".into(),
    };
    let legacy = LegacyAsset {
      path: b.to_string_lossy().into_owned(),
      name: "b.bin".into(),
      ext: "bin".into(),
      video_path: None,
    };

    let (conf, _, _) = classify_duplicate_confidence(&asset, &legacy);
    assert_eq!(conf, DuplicateMatchConfidence::High);

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn classify_medium_when_same_size_different_content() {
    let dir = std::env::temp_dir().join(format!(
      "dup_conf_med_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let a = dir.join("a.bin");
    let b = dir.join("b.bin");
    std::fs::write(&a, b"1111").expect("write");
    std::fs::write(&b, b"2222").expect("write");

    let asset = CanonicalAsset {
      asset_id: "A".into(),
      media_kind: "photo".into(),
      content_key: "x".into(),
      still_path: Some(a.to_string_lossy().into_owned()),
      mov_path: None,
      display_name: "x.jpg".into(),
    };
    let legacy = LegacyAsset {
      path: b.to_string_lossy().into_owned(),
      name: "b.bin".into(),
      ext: "bin".into(),
      video_path: None,
    };

    let (conf, _, _) = classify_duplicate_confidence(&asset, &legacy);
    assert_eq!(conf, DuplicateMatchConfidence::Medium);

    let _ = std::fs::remove_dir_all(&dir);
  }
}
