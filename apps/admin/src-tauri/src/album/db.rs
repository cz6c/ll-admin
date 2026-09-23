//! 相册媒体 SQLite 索引
//! 职责：扫描结果持久化、增量比对（path + modified + size）、缩略图/预览/播放代理缓存路径、内容指纹
//! 适用：增量扫描、文件监听后的局部更新、重复检测懒写哈希

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};

use super::types::{MediaFile, MediaGroup, MediaKind};

const DB_FILE: &str = "media.db";

/// 缩略图连续失败次数达到此阈值后跳过重试，避免对坏文件反复解码
pub const FAIL_THRESHOLD: u32 = 2;

/// 打开相册库。已有 `media` 表则只设连接参数，不再改表
/// @note 结构变更不写在这里：单独 SQL 手工执行后删除脚本，避免每次 open 抢写锁
pub fn open_db(album_dir: &Path) -> Result<Connection, String> {
  let path = album_dir.join(DB_FILE);
  let conn = Connection::open(&path).map_err(|e| format!("打开相册数据库失败: {e}"))?;
  prepare_conn(&conn)?;
  if !table_exists(&conn, "media")? {
    create_schema(&conn)?;
  }
  Ok(conn)
}

fn prepare_conn(conn: &Connection) -> Result<(), String> {
  conn
    .busy_timeout(Duration::from_secs(5))
    .map_err(|e| format!("设置相册库 busy_timeout 失败: {e}"))?;
  ensure_wal(conn)
}

/// 已是 WAL 则不再写 journal_mode，避免每次 open 抢锁
fn ensure_wal(conn: &Connection) -> Result<(), String> {
  let mode: String = conn
    .query_row("PRAGMA journal_mode", [], |row| row.get(0))
    .map_err(|e| format!("读取 journal_mode 失败: {e}"))?;
  if mode.eq_ignore_ascii_case("wal") {
    return Ok(());
  }
  conn
    .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
    .map_err(|e| format!("设置相册库 WAL 失败: {e}"))
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, String> {
  let exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
      params![table],
      |_| Ok(true),
    )
    .optional()
    .map_err(|e| format!("探测表 {table} 失败: {e}"))?
    .unwrap_or(false);
  Ok(exists)
}

/// 空库建终态表（含指纹、来源、拍摄时间列）。已有库不走此函数
fn create_schema(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
      CREATE TABLE media (
        path TEXT PRIMARY KEY,
        root TEXT NOT NULL,
        rel_dir TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        size INTEGER NOT NULL,
        modified INTEGER NOT NULL,
        ext TEXT NOT NULL,
        thumb_path TEXT,
        preview_path TEXT,
        playback_path TEXT,
        video_path TEXT,
        scanned_at INTEGER NOT NULL,
        fail_count INTEGER NOT NULL DEFAULT 0,
        capture_at TEXT,
        capture_at_source TEXT,
        capture_at_probed INTEGER NOT NULL DEFAULT 0,
        camera TEXT,
        width INTEGER,
        height INTEGER,
        content_hash TEXT,
        hash_algo TEXT,
        origin TEXT,
        origin_asset_id TEXT,
        origin_account TEXT,
        origin_album TEXT,
        added_at TEXT,
        latitude REAL,
        longitude REAL
      );
      CREATE INDEX idx_media_root ON media(root);
      CREATE INDEX idx_media_root_rel ON media(root, rel_dir);
      ",
    )
    .map_err(|e| format!("初始化相册表失败: {e}"))
}

/// 读取某根目录下已索引的 path → (size, modified, 缓存路径)
/// 失败计数（fail_count）请走 `load_fail_counts`，避免在此重复拉取
pub fn load_indexed_paths(
  conn: &Connection,
  root: &str,
) -> Result<HashMap<String, IndexedRow>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, size, modified, thumb_path, preview_path, playback_path, capture_at, camera, width, height,
              capture_at_source, capture_at_probed
       FROM media WHERE root = ?1",
    )
    .map_err(|e| format!("准备索引查询失败: {e}"))?;

  let rows = stmt
    .query_map(params![root], |row| {
      Ok(IndexedRow {
        path: row.get(0)?,
        size: row.get::<_, i64>(1)? as u64,
        modified: row.get::<_, i64>(2)?,
        thumb_path: row.get(3)?,
        preview_path: row.get(4)?,
        playback_path: row.get(5)?,
        capture_at: row.get(6)?,
        camera: row.get(7)?,
        width: row.get::<_, Option<i64>>(8)?.map(|v| v as u32),
        height: row.get::<_, Option<i64>>(9)?.map(|v| v as u32),
        capture_at_source: row.get(10)?,
        capture_at_probed: row.get::<_, i64>(11).unwrap_or(0) != 0,
      })
    })
    .map_err(|e| format!("查询索引失败: {e}"))?
    .filter_map(|r| r.ok())
    .map(|r| (r.path.clone(), r))
    .collect();

  Ok(rows)
}

#[derive(Debug, Clone)]
pub struct IndexedRow {
  pub path: String,
  pub size: u64,
  pub modified: i64,
  pub thumb_path: Option<String>,
  pub preview_path: Option<String>,
  pub playback_path: Option<String>,
  pub capture_at: Option<String>,
  pub camera: Option<String>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  pub capture_at_source: Option<String>,
  pub capture_at_probed: bool,
}

/// 从 DB 重建 groups（缓存命中路径：dirty=false 时使用，跳过 WalkDir 全量重扫）
/// 组内不排拍摄序：宫格/列表排序在前端 `filteredFiles`（与筛选同处，避免双端维护）
/// dir_name 由 rel_dir 派生：根目录用 root basename，子目录用 rel_dir 最后一级
pub fn load_groups(conn: &Connection, root: &str) -> Result<Vec<MediaGroup>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, name, kind, size, modified, ext, thumb_path, preview_path, playback_path, video_path, rel_dir,
              capture_at, camera, width, height, capture_at_source, capture_at_probed,
              origin, origin_asset_id, origin_account, origin_album, added_at, latitude, longitude
       FROM media WHERE root = ?1 ORDER BY rel_dir, name",
    )
    .map_err(|e| format!("准备缓存查询失败: {e}"))?;

  let root_basename = Path::new(root)
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or(root)
    .to_string();
  let root_path_buf = Path::new(root).to_path_buf();

  let rows = stmt
    .query_map(params![root], |row| {
      let rel_dir: String = row.get(10)?;
      let dir_name = if rel_dir == "." {
        root_basename.clone()
      } else {
        Path::new(&rel_dir)
          .file_name()
          .and_then(|n| n.to_str())
          .unwrap_or(&rel_dir)
          .to_string()
      };
      let kind_str: String = row.get(2)?;
      let kind = match kind_str.as_str() {
        "video" => MediaKind::Video,
        "livephoto" => MediaKind::LivePhoto,
        _ => MediaKind::Image,
      };
      // is_file() 检查：DB 中可能残留指向已删除/损坏文件的缓存路径
      let thumb_path: Option<String> = row.get(6)?;
      let thumb_path = thumb_path.filter(|p| Path::new(p).is_file());
      let preview_path: Option<String> = row.get(7)?;
      let preview_path = preview_path.filter(|p| Path::new(p).is_file());
      let playback_path: Option<String> = row.get(8)?;
      let playback_path = playback_path.filter(|p| Path::new(p).is_file());
      let capture_at: Option<String> = row.get(11)?;
      let capture_at = capture_at.filter(|s| !s.trim().is_empty());
      let camera: Option<String> = row.get(12)?;
      let camera = camera.filter(|s| !s.trim().is_empty());
      let width = row.get::<_, Option<i64>>(13)?.map(|v| v as u32).filter(|&v| v > 0);
      let height = row.get::<_, Option<i64>>(14)?.map(|v| v as u32).filter(|&v| v > 0);
      let capture_at_source: Option<String> = row.get(15)?;
      let capture_at_source = capture_at_source.filter(|s| !s.trim().is_empty());
      let capture_at_probed = row.get::<_, i64>(16).unwrap_or(0) != 0;
      let origin: Option<String> = row.get(17)?;
      let origin = origin.filter(|s| !s.trim().is_empty());
      let origin_asset_id: Option<String> = row.get(18)?;
      let origin_asset_id = origin_asset_id.filter(|s| !s.trim().is_empty());
      let origin_account: Option<String> = row.get(19)?;
      let origin_account = origin_account.filter(|s| !s.trim().is_empty());
      let origin_album: Option<String> = row.get(20)?;
      let origin_album = origin_album.filter(|s| !s.trim().is_empty());
      let added_at: Option<String> = row.get(21)?;
      let added_at = added_at.filter(|s| !s.trim().is_empty());
      let latitude: Option<f64> = row.get(22)?;
      let longitude: Option<f64> = row.get(23)?;
      Ok((rel_dir.clone(), dir_name, MediaFile {
        path: row.get(0)?,
        name: row.get(1)?,
        kind,
        size: row.get::<_, i64>(3)? as u64,
        modified: row.get::<_, i64>(4)?,
        ext: row.get(5)?,
        thumb_path,
        preview_path,
        playback_path,
        video_path: row.get(9)?,
        capture_at,
        capture_at_source,
        capture_at_probed,
        rel_dir,
        camera,
        width,
        height,
        origin,
        origin_asset_id,
        origin_account,
        origin_album,
        added_at,
        latitude,
        longitude,
      }))
    })
    .map_err(|e| format!("查询缓存失败: {e}"))?;

  // 按 rel_dir 分组；保留首次出现的 dir_name（同 rel_dir 内 SQL 已保证一致）
  let mut dir_map: HashMap<String, (String, Vec<MediaFile>)> = HashMap::new();
  for r in rows.filter_map(|r| r.ok()) {
    let entry = dir_map.entry(r.0.clone()).or_insert_with(|| (r.1.clone(), Vec::new()));
    entry.1.push(r.2);
  }

  let mut groups: Vec<MediaGroup> = dir_map
    .into_iter()
    .map(|(rel_path, (dir_name, files))| {
      let dir_path = if rel_path == "." {
        root.to_string()
      } else {
        root_path_buf.join(&rel_path).to_string_lossy().to_string()
      };
      MediaGroup {
        dir_name,
        dir_path,
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

fn now_secs() -> i64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0)
}

/// 写入或更新单条媒体索引（裸 SQL 实现，供批量事务复用）
fn upsert_media_impl(
  conn: &Connection,
  root: &str,
  rel_dir: &str,
  file: &MediaFile,
  thumb_path: Option<&str>,
  preview_path: Option<&str>,
  playback_path: Option<&str>,
) -> Result<(), String> {
  let kind = match file.kind {
    MediaKind::Image => "image",
    MediaKind::Video => "video",
    MediaKind::LivePhoto => "livephoto",
  };
  let scanned_at = now_secs();

  conn
    .execute(
      "
      INSERT INTO media(
        path, root, rel_dir, name, kind, size, modified, ext,
        thumb_path, preview_path, playback_path, video_path, scanned_at, fail_count,
        origin, origin_asset_id, origin_account, origin_album, added_at, latitude, longitude,
        capture_at, capture_at_source, capture_at_probed, camera, width, height
      ) VALUES (
        ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,0,
        ?14,?15,?16,?17,?18,?19,?20,
        ?21,?22,?23,?24,?25,?26
      )
      ON CONFLICT(path) DO UPDATE SET
        root=excluded.root, rel_dir=excluded.rel_dir, name=excluded.name,
        kind=excluded.kind, size=excluded.size, modified=excluded.modified,
        ext=excluded.ext, thumb_path=excluded.thumb_path,
        preview_path=excluded.preview_path, playback_path=excluded.playback_path,
        video_path=excluded.video_path,
        scanned_at=excluded.scanned_at,
        fail_count = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.fail_count
          ELSE 0
        END,
        capture_at = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.capture_at
          ELSE NULL
        END,
        capture_at_source = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.capture_at_source
          ELSE NULL
        END,
        capture_at_probed = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.capture_at_probed
          ELSE 0
        END,
        camera = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.camera
          ELSE NULL
        END,
        width = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.width
          ELSE NULL
        END,
        height = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.height
          ELSE NULL
        END,
        content_hash = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.content_hash
          ELSE NULL
        END,
        hash_algo = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.hash_algo
          ELSE NULL
        END,
        -- 同步身份：ingress 有值则写入/更新；discover 传 NULL 时保留本表
        origin = COALESCE(excluded.origin, media.origin),
        origin_asset_id = COALESCE(excluded.origin_asset_id, media.origin_asset_id),
        origin_account = COALESCE(excluded.origin_account, media.origin_account),
        origin_album = COALESCE(excluded.origin_album, media.origin_album),
        added_at = COALESCE(excluded.added_at, media.added_at),
        latitude = COALESCE(excluded.latitude, media.latitude),
        longitude = COALESCE(excluded.longitude, media.longitude)
      ",
      params![
        file.path,
        root,
        rel_dir,
        file.name,
        kind,
        file.size as i64,
        file.modified,
        file.ext,
        thumb_path,
        preview_path,
        playback_path,
        file.video_path,
        scanned_at,
        file.origin,
        file.origin_asset_id,
        file.origin_account,
        file.origin_album,
        file.added_at,
        file.latitude,
        file.longitude,
        file.capture_at,
        file.capture_at_source,
        if file.capture_at_probed { 1i64 } else { 0 },
        file.camera,
        file.width.map(|v| v as i64),
        file.height.map(|v| v as i64),
      ],
    )
    .map_err(|e| format!("写入媒体索引失败: {e}"))?;
  Ok(())
}

/// 一次事务内：删陈旧路径（并收集派生缓存待清）+ upsert 全部分组
/// 避免 delete 已提交、upsert 失败时 DB 既丢旧行又无新行
/// @note 事务提交后再 purge 孤儿 thumb/preview/playback，与 `album_delete_local` 对齐
pub fn sync_media_index(
  conn: &Connection,
  album_data_dir: &Path,
  root: &str,
  groups: &[super::types::MediaGroup],
  alive_paths: &[String],
) -> Result<(), String> {
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启索引同步事务失败: {e}"))?;

  let mut stmt = tx
    .prepare("SELECT path FROM media WHERE root = ?1")
    .map_err(|e| format!("查询陈旧路径失败: {e}"))?;
  let existing: Vec<String> = stmt
    .query_map(params![root], |row| row.get(0))
    .map_err(|e| format!("读取陈旧路径失败: {e}"))?
    .filter_map(|r| r.ok())
    .collect();
  drop(stmt);

  let alive: std::collections::HashSet<&str> =
    alive_paths.iter().map(|s| s.as_str()).collect();
  let mut caches_to_purge: Vec<std::path::PathBuf> = Vec::new();

  for path in existing {
    if alive.contains(path.as_str()) {
      continue;
    }
    // 外部删图后 discover：先记下伴生缓存，提交删行后再永久清盘
    let (thumb, preview, video, playback) = get_media_companion_paths(&tx, &path)?;
    for cache in super::fs_delete::collect_derived_cache_paths(
      album_data_dir,
      &path,
      thumb.as_deref(),
      preview.as_deref(),
      video.as_deref(),
      playback.as_deref(),
    ) {
      if !caches_to_purge.iter().any(|x| x == &cache) {
        caches_to_purge.push(cache);
      }
    }
    tx.execute("DELETE FROM media WHERE path = ?1", params![path])
      .map_err(|e| format!("删除陈旧索引失败: {e}"))?;
  }

  for group in groups {
    for file in &group.files {
      upsert_media_impl(
        &tx,
        root,
        &group.rel_path,
        file,
        file.thumb_path.as_deref(),
        file.preview_path.as_deref(),
        file.playback_path.as_deref(),
      )?;
    }
  }

  tx.commit()
    .map_err(|e| format!("提交索引同步事务失败: {e}"))?;

  super::fs_delete::purge_derived_cache_paths(&caches_to_purge);
  Ok(())
}

/// 事务内批量更新缩略图/预览路径与解码尺寸（供 pipeline 每 chunk 提交一次）
/// - thumb/preview/宽高 传 None 表示「不更新」（COALESCE 保留旧值）
/// - 成功更新时重置 fail_count
pub fn update_cache_paths_batch(
  conn: &Connection,
  updates: &[(String, Option<String>, Option<String>, Option<u32>, Option<u32>)],
) -> Result<(), String> {
  if updates.is_empty() {
    return Ok(());
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启缓存更新事务失败: {e}"))?;
  for (path, thumb_path, preview_path, width, height) in updates {
    tx.execute(
      "UPDATE media SET
         thumb_path = COALESCE(?2, thumb_path),
         preview_path = COALESCE(?3, preview_path),
         width = COALESCE(?4, width),
         height = COALESCE(?5, height),
         fail_count = 0
       WHERE path = ?1",
      params![
        path,
        thumb_path,
        preview_path,
        width.map(|v| v as i64),
        height.map(|v| v as i64)
      ],
    )
    .map_err(|e| format!("更新缓存路径失败: {e}"))?;
  }
  tx.commit()
    .map_err(|e| format!("提交缓存更新事务失败: {e}"))?;
  Ok(())
}

/**
 * 同步下载成功：复用 discover upsert + 仅补空 meta（不另写一套 SQL）
 */
pub fn upsert_media_from_sync(
  conn: &Connection,
  root: &str,
  item: &super::types::SyncedMediaIngress,
) -> Result<(), String> {
  let path = item.path.as_str();
  let file_path = Path::new(path);
  if !file_path.is_file() {
    return Err(format!("文件不存在: {path}"));
  }
  let ext = file_path
    .extension()
    .and_then(|e| e.to_str())
    .map(|e| e.to_lowercase())
    .unwrap_or_default();
  let kind = if super::thumbnail::is_video_ext(&ext) {
    MediaKind::Video
  } else {
    MediaKind::Image
  };
  let meta = std::fs::metadata(file_path).map_err(|e| format!("读文件元数据失败: {e}"))?;
  let size = meta.len();
  let modified = meta
    .modified()
    .ok()
    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);
  let name = file_path
    .file_name()
    .and_then(|n| n.to_str())
    .unwrap_or_default()
    .to_string();
  let parent = file_path.parent().unwrap_or(file_path);
  let rel_dir = parent
    .strip_prefix(Path::new(root))
    .ok()
    .map(|p| {
      let s = p.to_string_lossy().replace('\\', "/");
      if s.is_empty() {
        ".".to_string()
      } else {
        s
      }
    })
    .unwrap_or_else(|| ".".to_string());

  let fill =
    super::media_meta::resolve_capture_meta(path, item.origin_capture_at.as_deref());
  let nonempty = |s: &str| (!s.is_empty()).then_some(s.to_string());
  let file = MediaFile {
    path: path.to_string(),
    name,
    kind,
    size,
    modified,
    ext,
    thumb_path: None,
    preview_path: None,
    playback_path: None,
    video_path: None,
    capture_at: fill.capture_at.clone(),
    capture_at_source: fill.capture_at_source.clone(),
    capture_at_probed: true,
    rel_dir: rel_dir.clone(),
    camera: fill.camera.clone(),
    width: None,
    height: None,
    origin: nonempty(&item.origin),
    origin_asset_id: nonempty(&item.origin_asset_id),
    origin_account: nonempty(&item.origin_account),
    origin_album: item.origin_album.clone(),
    added_at: item.added_at.clone(),
    latitude: item.latitude,
    longitude: item.longitude,
  };
  upsert_media_impl(conn, root, &rel_dir, &file, None, None, None)
    .map_err(|e| format!("同步入库 media 失败: {e}"))?;
  // 指纹变时 upsert 会清空 capture；仅补空写回 origin/EXIF/文件名
  update_meta_fill_batch(conn, &[(path.to_string(), fill)])
}

/// 批量补写 EXIF/文件名元数据：仅补空 capture/camera；总是写 probed
pub fn update_meta_fill_batch(
  conn: &Connection,
  updates: &[(String, super::media_meta::MediaMetaFill)],
) -> Result<(), String> {
  if updates.is_empty() {
    return Ok(());
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启元数据更新事务失败: {e}"))?;
  for (path, fill) in updates {
    tx.execute(
      "UPDATE media SET
         capture_at = CASE
           WHEN (capture_at IS NULL OR trim(capture_at) = '') AND ?2 IS NOT NULL AND trim(?2) != ''
             THEN ?2
           ELSE capture_at
         END,
         capture_at_source = CASE
           WHEN (capture_at IS NULL OR trim(capture_at) = '') AND ?2 IS NOT NULL AND trim(?2) != ''
             THEN ?4
           WHEN (capture_at_source IS NULL OR trim(capture_at_source) = '') AND ?4 IS NOT NULL AND trim(?4) != ''
             THEN ?4
           ELSE capture_at_source
         END,
         camera = CASE
           WHEN (camera IS NULL OR trim(camera) = '') AND ?3 IS NOT NULL AND trim(?3) != ''
             THEN ?3
           ELSE camera
         END,
         capture_at_probed = 1
       WHERE path = ?1",
      params![
        path,
        fill.capture_at,
        fill.camera,
        fill.capture_at_source,
      ],
    )
    .map_err(|e| format!("更新媒体元数据失败: {e}"))?;
  }
  tx.commit()
    .map_err(|e| format!("提交元数据更新事务失败: {e}"))?;
  Ok(())
}

/// 解析拍摄时间串 → unix 秒
/// 带时区的 RFC3339 按其偏移；无时区的墙钟按本地时区，使文件名前缀 / EXIF 与用户所选时分秒一致
pub(crate) fn parse_capture_timestamp(raw: &str) -> Option<i64> {
  let raw = raw.trim();
  if raw.is_empty() {
    return None;
  }
  if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
    return Some(dt.timestamp());
  }
  for fmt in [
    "%Y-%m-%dT%H:%M:%S%.fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S%.f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
  ] {
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(raw, fmt) {
      return local_naive_to_unix(naive);
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(raw, fmt) {
      let naive = d.and_hms_opt(0, 0, 0)?;
      return local_naive_to_unix(naive);
    }
  }
  None
}

fn local_naive_to_unix(naive: chrono::NaiveDateTime) -> Option<i64> {
  use chrono::{LocalResult, TimeZone};

  match chrono::Local.from_local_datetime(&naive) {
    LocalResult::Single(dt) | LocalResult::Ambiguous(dt, _) => Some(dt.timestamp()),
    LocalResult::None => None,
  }
}

/// 用户批量修改拍摄时间：可覆盖已有值；同步风格文件名改前缀
/// @returns (updated, rejected, 最终 path + unix_secs 供 EXIF, 路径变更 from→to)
pub fn set_capture_at_user_batch(
  conn: &Connection,
  items: &[(String, String)],
) -> Result<(u32, u32, Vec<(String, i64)>, Vec<(String, String)>), String> {
  let mut updated = 0u32;
  let mut rejected = 0u32;
  let mut written: Vec<(String, i64)> = Vec::new();
  let mut renames: Vec<(String, String)> = Vec::new();
  if items.is_empty() {
    return Ok((0, 0, written, renames));
  }

  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启拍摄时间写入事务失败: {e}"))?;

  for (path, capture_at) in items {
    let raw = capture_at.trim();
    let Some(secs) = parse_capture_timestamp(raw) else {
      rejected += 1;
      continue;
    };
    let next = if raw.len() == 10 && raw.chars().filter(|c| *c == '-').count() == 2 {
      format!("{raw}T00:00:00")
    } else {
      raw.to_string()
    };

    let row: Option<(String, Option<String>)> = tx
      .query_row(
        "SELECT name, video_path FROM media WHERE path = ?1",
        params![path],
        |r| Ok((r.get(0)?, r.get(1)?)),
      )
      .optional()
      .map_err(|e| format!("读取媒体行失败: {e}"))?;

    let Some((_old_name, video_path)) = row else {
      rejected += 1;
      continue;
    };

    let old_path = Path::new(path.as_str());
    if !old_path.is_file() {
      rejected += 1;
      continue;
    }

    let (final_path, final_name, video_rename) =
      match super::media_meta::path_with_rewritten_capture_prefix(old_path, secs) {
        Some(new_path) if new_path != old_path => {
          if new_path.exists() {
            rejected += 1;
            continue;
          }
          let new_name = new_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
          if new_name.is_empty() {
            rejected += 1;
            continue;
          }

          // Live：同 stem 的 mov 一并改前缀，避免配对断裂
          let video_rename = video_path.as_ref().and_then(|vp| {
            let old_mov = Path::new(vp.as_str());
            let old_stem = old_path.file_stem()?.to_str()?;
            let mov_stem = old_mov.file_stem()?.to_str()?;
            if old_stem != mov_stem {
              return None;
            }
            let new_mov = super::media_meta::path_with_rewritten_capture_prefix(old_mov, secs)?;
            if new_mov == old_mov {
              return None;
            }
            if new_mov.exists() {
              return None;
            }
            Some((vp.clone(), new_mov.to_string_lossy().to_string()))
          });

          if video_path.is_some() && video_rename.is_none() {
            // 有配对 mov 但无法安全改名时整项拒绝，避免只改 still
            let old_stem = old_path.file_stem().and_then(|s| s.to_str());
            let mov_stem = video_path
              .as_ref()
              .and_then(|vp| Path::new(vp.as_str()).file_stem().and_then(|s| s.to_str()));
            if old_stem.is_some() && old_stem == mov_stem {
              rejected += 1;
              continue;
            }
          }

          if let Err(e) = std::fs::rename(old_path, &new_path) {
            log::warn!("album: rename capture prefix {path}: {e}");
            rejected += 1;
            continue;
          }
          if let Some((ref from_mov, ref to_mov)) = video_rename {
            if let Err(e) = std::fs::rename(Path::new(from_mov), Path::new(to_mov)) {
              // still 已改名：尽量回滚 still，避免索引与盘不一致
              let _ = std::fs::rename(&new_path, old_path);
              log::warn!("album: rename live mov {from_mov}: {e}");
              rejected += 1;
              continue;
            }
          }

          (
            new_path.to_string_lossy().to_string(),
            new_name,
            video_rename,
          )
        }
        _ => {
          let name = old_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
          (path.clone(), name, None)
        }
      };

    let n = tx
      .execute(
        "UPDATE media
         SET path = ?2,
             name = ?3,
             capture_at = ?4,
             capture_at_source = 'user',
             capture_at_probed = 1,
             video_path = COALESCE(?5, video_path)
         WHERE path = ?1",
        params![
          path,
          final_path,
          final_name,
          next,
          video_rename.as_ref().map(|(_, to)| to.as_str()),
        ],
      )
      .map_err(|e| format!("写入拍摄时间失败: {e}"))?;
    if n == 0 {
      rejected += 1;
      continue;
    }

    if let Some((ref from_mov, ref to_mov)) = video_rename {
      // 其它行若把该 mov 当 video_path，一并改写
      let _ = tx.execute(
        "UPDATE media SET video_path = ?2 WHERE video_path = ?1",
        params![from_mov, to_mov],
      );
    }

    updated += 1;
    written.push((final_path.clone(), secs));
    if final_path != *path {
      renames.push((path.clone(), final_path));
    }
    if let Some((from_mov, to_mov)) = video_rename {
      if from_mov != to_mov {
        renames.push((from_mov, to_mov));
      }
    }
  }

  tx.commit()
    .map_err(|e| format!("提交拍摄时间写入失败: {e}"))?;
  Ok((updated, rejected, written, renames))
}

/// 写入宽高（单独视频打开时 ffprobe 真源；可覆盖错误的海报尺寸）
pub fn update_dimensions(
  conn: &Connection,
  path: &str,
  width: u32,
  height: u32,
) -> Result<(), String> {
  update_dimensions_batch(conn, &[(path.to_string(), width, height)])
}

/// 批量写入宽高（单事务）
pub fn update_dimensions_batch(
  conn: &Connection,
  updates: &[(String, u32, u32)],
) -> Result<(), String> {
  if updates.is_empty() {
    return Ok(());
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启分辨率批量事务失败: {e}"))?;
  for (path, width, height) in updates {
    if *width == 0 || *height == 0 {
      continue;
    }
    tx.execute(
      "UPDATE media SET width = ?2, height = ?3 WHERE path = ?1",
      params![path, *width as i64, *height as i64],
    )
    .map_err(|e| format!("更新分辨率失败: {e}"))?;
  }
  tx.commit()
    .map_err(|e| format!("提交分辨率批量事务失败: {e}"))?;
  Ok(())
}

/// 是否存在未探测或仍缺机型的已展示行（LIMIT 1，供 pipeline 早退）
pub fn has_missing_meta(conn: &Connection, root: &str) -> Result<bool, String> {
  conn
    .query_row(
      "SELECT 1 FROM media
       WHERE root = ?1
         AND (
           (thumb_path IS NOT NULL AND trim(thumb_path) != '')
           OR (preview_path IS NOT NULL AND trim(preview_path) != '')
         )
         AND (
           COALESCE(capture_at_probed, 0) = 0
           OR camera IS NULL OR trim(camera) = ''
         )
       LIMIT 1",
      params![root],
      |_| Ok(true),
    )
    .optional()
    .map(|o| o.unwrap_or(false))
    .map_err(|e| format!("探测缺元数据失败: {e}"))
}

/// 已有缩略图/预览但未探测拍摄来源或仍缺机型的路径
pub fn list_paths_missing_meta(
  conn: &Connection,
  root: &str,
) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path FROM media
       WHERE root = ?1
         AND (
           (thumb_path IS NOT NULL AND trim(thumb_path) != '')
           OR (preview_path IS NOT NULL AND trim(preview_path) != '')
         )
         AND (
           COALESCE(capture_at_probed, 0) = 0
           OR camera IS NULL OR trim(camera) = ''
         )",
    )
    .map_err(|e| format!("准备缺元数据查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![root], |row| row.get::<_, String>(0))
    .map_err(|e| format!("查询缺元数据失败: {e}"))?
    .filter_map(|r| r.ok())
    .collect();
  Ok(rows)
}

/// 是否存在非视频缺宽高（LIMIT 1）
pub fn has_missing_image_dimensions(conn: &Connection, root: &str) -> Result<bool, String> {
  conn
    .query_row(
      "SELECT 1 FROM media
       WHERE root = ?1
         AND kind != 'video'
         AND (width IS NULL OR width <= 0 OR height IS NULL OR height <= 0)
         AND (
           (thumb_path IS NOT NULL AND trim(thumb_path) != '')
           OR (preview_path IS NOT NULL AND trim(preview_path) != '')
         )
       LIMIT 1",
      params![root],
      |_| Ok(true),
    )
    .optional()
    .map(|o| o.unwrap_or(false))
    .map_err(|e| format!("探测缺图片尺寸失败: {e}"))
}

/// 非视频且缺宽高的路径（小图复用原图等未走解码时补 `image_dimensions`）
pub fn list_paths_missing_image_dimensions(
  conn: &Connection,
  root: &str,
) -> Result<Vec<String>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path FROM media
       WHERE root = ?1
         AND kind != 'video'
         AND (width IS NULL OR width <= 0 OR height IS NULL OR height <= 0)
         AND (
           (thumb_path IS NOT NULL AND trim(thumb_path) != '')
           OR (preview_path IS NOT NULL AND trim(preview_path) != '')
         )",
    )
    .map_err(|e| format!("准备缺图片尺寸查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![root], |row| row.get::<_, String>(0))
    .map_err(|e| format!("查询缺图片尺寸失败: {e}"))?
    .filter_map(|r| r.ok())
    .collect();
  Ok(rows)
}

/// 是否存在 Live 缺播放代理（LIMIT 1）
pub fn has_live_missing_playback(conn: &Connection, root: &str) -> Result<bool, String> {
  conn
    .query_row(
      "SELECT 1 FROM media
       WHERE root = ?1
         AND kind = 'livephoto'
         AND video_path IS NOT NULL AND trim(video_path) != ''
         AND (playback_path IS NULL OR trim(playback_path) = '')
       LIMIT 1",
      params![root],
      |_| Ok(true),
    )
    .optional()
    .map(|o| o.unwrap_or(false))
    .map_err(|e| format!("探测缺 Live 代理失败: {e}"))
}

/// Live 缺播放代理：(still_path, video_path)；供扫描期预热
pub fn list_live_missing_playback(
  conn: &Connection,
  root: &str,
) -> Result<Vec<(String, String)>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, video_path FROM media
       WHERE root = ?1
         AND kind = 'livephoto'
         AND video_path IS NOT NULL AND trim(video_path) != ''
         AND (playback_path IS NULL OR trim(playback_path) = '')",
    )
    .map_err(|e| format!("准备缺 Live 代理查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![root], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|e| format!("查询缺 Live 代理失败: {e}"))?
    .filter_map(|r| r.ok())
    .filter(|(still, mov)| Path::new(still).is_file() && Path::new(mov.trim()).is_file())
    .map(|(still, mov)| (still, mov.trim().to_string()))
    .collect();
  Ok(rows)
}

/// 写入 HEVC 播放代理路径；普通视频绑 path 行，Live mov 绑 video_path 匹配的行
pub fn update_playback_path(
  conn: &Connection,
  source_path: &str,
  playback_path: &str,
) -> Result<(), String> {
  update_playback_path_batch(conn, &[(source_path.to_string(), playback_path.to_string())])
}

/// 批量写入播放代理（单事务；source 可为 path 或 Live 的 video_path）
pub fn update_playback_path_batch(
  conn: &Connection,
  updates: &[(String, String)],
) -> Result<(), String> {
  if updates.is_empty() {
    return Ok(());
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启播放代理批量事务失败: {e}"))?;
  for (source_path, playback_path) in updates {
    let n = tx
      .execute(
        "UPDATE media SET playback_path = ?2 WHERE path = ?1",
        params![source_path, playback_path],
      )
      .map_err(|e| format!("更新播放代理路径失败: {e}"))?;
    if n == 0 {
      tx.execute(
        "UPDATE media SET playback_path = ?2 WHERE video_path = ?1",
        params![source_path, playback_path],
      )
      .map_err(|e| format!("更新 Live 播放代理路径失败: {e}"))?;
    }
  }
  tx.commit()
    .map_err(|e| format!("提交播放代理批量事务失败: {e}"))?;
  Ok(())
}

/// 标记某文件缩略图生成失败（fail_count +1）
pub fn mark_thumb_failed(conn: &Connection, path: &str) -> Result<(), String> {
  conn
    .execute(
      "UPDATE media SET fail_count = fail_count + 1 WHERE path = ?1",
      params![path],
    )
    .map_err(|e| format!("更新失败计数失败: {e}"))?;
  Ok(())
}

/// 原图当缩略图的像素上限（与 `thumbnail::ORIGIN_AS_THUMB_MAX_PIXELS` 对齐）
const ORIGIN_THUMB_MAX_PIXELS_SQL: i64 = 2_000_000;
/// 原图当缩略图的体积上限
const ORIGIN_THUMB_MAX_BYTES_SQL: i64 = 100 * 1024;

/**
 * 清除不安全的「原路径当 thumb_path」脏数据
 * 条件：thumb_path 与 path 同路径，且（体积过大 / GIF / 像素过高）
 * @returns 清除行数；随后扫描会重新入队出图
 */
pub fn scrub_unsafe_origin_thumbs(conn: &Connection) -> Result<u32, String> {
  // SQLite 路径比较：统一小写 + 反斜杠转正斜杠
  let n = conn
    .execute(
      "UPDATE media SET thumb_path = NULL, fail_count = 0
       WHERE thumb_path IS NOT NULL
         AND trim(thumb_path) != ''
         AND lower(replace(thumb_path, '\\', '/')) = lower(replace(path, '\\', '/'))
         AND (
           size > ?1
           OR lower(ext) = 'gif'
           OR (
             width IS NOT NULL AND height IS NOT NULL
             AND (CAST(width AS INTEGER) * CAST(height AS INTEGER)) > ?2
           )
         )",
      params![ORIGIN_THUMB_MAX_BYTES_SQL, ORIGIN_THUMB_MAX_PIXELS_SQL],
    )
    .map_err(|e| format!("清除不安全原图缩略图失败: {e}"))?;
  Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

/// 超大图全尺寸解码易失败；scale-on-decode 上线后清掉「缺图且已达失败阈值」的计数，允许再试
/// @note 仅针对像素 > `FULL_DECODE_MAX_PIXELS`（与 thumbnail 常量对齐），真坏文件仍可再次打满阈值
pub fn reset_exhausted_oversized_thumb_failures(conn: &Connection) -> Result<u32, String> {
  const OVERSIZED_PIXELS: i64 = 8_000_000;
  let n = conn
    .execute(
      "UPDATE media SET fail_count = 0
       WHERE (thumb_path IS NULL OR trim(thumb_path) = '')
         AND fail_count >= ?1
         AND width IS NOT NULL AND height IS NOT NULL
         AND (CAST(width AS INTEGER) * CAST(height AS INTEGER)) > ?2",
      params![FAIL_THRESHOLD as i64, OVERSIZED_PIXELS],
    )
    .map_err(|e| format!("重置超大图缩略图失败计数失败: {e}"))?;
  Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

/// 清空 thumb/preview/playback 缓存路径（`ALBUM_CACHE_VERSION` bump 迁移时调用）
pub fn clear_all_cache_paths(conn: &Connection) -> Result<(), String> {
  conn
    .execute(
      "UPDATE media SET thumb_path = NULL, preview_path = NULL, playback_path = NULL, fail_count = 0",
      [],
    )
    .map_err(|e| format!("清空缓存路径失败: {e}"))?;
  Ok(())
}

/// 读取单条 media 的伴生路径（缩略图、预览、Live mov、播放代理）
pub fn get_media_companion_paths(
  conn: &Connection,
  path: &str,
) -> Result<(Option<String>, Option<String>, Option<String>, Option<String>), String> {
  match conn
    .query_row(
      "SELECT thumb_path, preview_path, video_path, playback_path FROM media WHERE path = ?1",
      params![path],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()
    .map_err(|e| format!("读取媒体索引失败: {e}"))?
  {
    Some(row) => Ok(row),
    None => Ok((None, None, None, None)),
  }
}

/// 删除 media 索引行；返回是否删到行
pub fn delete_media_by_path(conn: &Connection, path: &str) -> Result<bool, String> {
  let n = conn
    .execute("DELETE FROM media WHERE path = ?1", params![path])
    .map_err(|e| format!("删除媒体索引失败: {e}"))?;
  Ok(n > 0)
}

/// 读取某根目录下所有 path → fail_count（供 pipeline 跳过反复失败的坏文件）
pub fn load_fail_counts(
  conn: &Connection,
  root: &str,
) -> Result<HashMap<String, u32>, String> {
  let mut stmt = conn
    .prepare("SELECT path, fail_count FROM media WHERE root = ?1")
    .map_err(|e| format!("准备失败计数查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![root], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u32))
    })
    .map_err(|e| format!("查询失败计数失败: {e}"))?
    .filter_map(|r| r.ok())
    .collect();
  Ok(rows)
}

/// 当前内容指纹算法名（写入 hash_algo；换算法须清空旧 content_hash 或 bump 迁移）
pub use super::content_hash::CONTENT_HASH_ALGO;

/**
 * 计算判重指纹（JPEG/PNG 去元数据后再 BLAKE3），返回小写 hex
 * @note 大视频仍读满整文件；算法见 `CONTENT_HASH_ALGO`
 */
pub fn compute_blake3_hex(path: &str) -> Option<String> {
  super::content_hash::compute_content_hash_hex(path)
}

/**
 * 读取库内有效内容指纹：algo 匹配且 size/modified 与调用方一致
 * @returns 有效则 Some(hex)，否则 None（需重算）
 */
pub fn load_valid_content_hash(
  conn: &Connection,
  path: &str,
  size: u64,
  modified: i64,
) -> Result<Option<String>, String> {
  let row: Option<(Option<String>, Option<String>, i64, i64)> = conn
    .query_row(
      "SELECT content_hash, hash_algo, size, modified FROM media WHERE path = ?1",
      params![path],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()
    .map_err(|e| format!("读取 content_hash 失败: {e}"))?;

  let Some((hash, algo, db_size, db_modified)) = row else {
    return Ok(None);
  };
  let hash = hash.filter(|s| !s.trim().is_empty());
  let algo_ok = algo.as_deref() == Some(CONTENT_HASH_ALGO);
  if hash.is_some() && algo_ok && db_size as u64 == size && db_modified == modified {
    return Ok(hash);
  }
  Ok(None)
}

/**
 * 将内容指纹写回 media 行（仅当 path 已在索引且 size/modified 仍匹配时更新）
 * @note 行不存在或文件已变则 0 行更新，不报错（重复扫描可先于相册索引）
 */
pub fn save_content_hash(
  conn: &Connection,
  path: &str,
  hash: &str,
  size: u64,
  modified: i64,
) -> Result<(), String> {
  conn
    .execute(
      r#"
      UPDATE media
      SET content_hash = ?1, hash_algo = ?2
      WHERE path = ?3 AND size = ?4 AND modified = ?5
      "#,
      params![hash, CONTENT_HASH_ALGO, path, size as i64, modified],
    )
    .map_err(|e| format!("写入 content_hash 失败: {e}"))?;
  Ok(())
}

/**
 * 同步入库身份索引：有 `origin` / `origin_asset_id` 的 media 行
 * @returns 规范化 path → (origin_asset_id?, kind)；供重复检测正本优先，不读 sync 库
 */
pub fn load_origin_path_index(
  conn: &Connection,
) -> Result<HashMap<String, (Option<String>, String)>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT path, origin_asset_id, kind
      FROM media
      WHERE (origin_asset_id IS NOT NULL AND trim(origin_asset_id) != '')
         OR (origin IS NOT NULL AND trim(origin) != '')
      "#,
    )
    .map_err(|e| format!("准备 origin 索引查询失败: {e}"))?;
  let rows = stmt
    .query_map([], |row| {
      let path: String = row.get(0)?;
      let origin_asset_id: Option<String> = row.get(1)?;
      let kind: String = row.get(2)?;
      Ok((path, origin_asset_id, kind))
    })
    .map_err(|e| format!("查询 origin 索引失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 origin 索引失败: {e}"))?;

  let mut map = HashMap::with_capacity(rows.len());
  for (path, origin_asset_id, kind) in rows {
    let key = path.replace('\\', "/").to_lowercase();
    let asset_id = origin_asset_id
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty());
    map.insert(key, (asset_id, kind));
  }
  Ok(map)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  #[test]
  fn sync_media_index_purges_orphan_thumb_after_stale_delete() {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let album_dir = std::env::temp_dir().join(format!("album_sync_purge_{nanos}"));
    let root = album_dir.join("photos");
    std::fs::create_dir_all(&root).expect("root");
    let conn = open_db(&album_dir).expect("db");

    let media = root.join("gone.jpg");
    let thumb = album_dir.join("orphan_thumb.webp");
    std::fs::write(&thumb, b"webp").expect("thumb");

    conn
      .execute(
        r#"
        INSERT INTO media(
          path, root, rel_dir, name, kind, size, modified, ext, thumb_path, scanned_at, fail_count
        ) VALUES (?1, ?2, '.', 'gone.jpg', 'image', 1, 1, 'jpg', ?3, 0, 0)
        "#,
        params![
          media.to_string_lossy().as_ref(),
          root.to_string_lossy().as_ref(),
          thumb.to_string_lossy().as_ref()
        ],
      )
      .expect("insert");

    // alive 为空：视为外部已删光，应删索引并 purge thumb
    sync_media_index(&conn, &album_dir, root.to_str().unwrap(), &[], &[]).expect("sync");

    assert!(!thumb.is_file(), "orphan thumb should be purged");
    let n: i64 = conn
      .query_row("SELECT COUNT(*) FROM media", [], |r| r.get(0))
      .expect("count");
    assert_eq!(n, 0);
    let _ = std::fs::remove_dir_all(&album_dir);
  }

  #[test]
  fn parse_capture_timestamp_naive_uses_local_wall_clock() {
    use chrono::TimeZone;

    let raw = "2020-05-01T15:30:45";
    let naive = chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%dT%H:%M:%S").expect("naive");
    let expected = chrono::Local
      .from_local_datetime(&naive)
      .single()
      .expect("local")
      .timestamp();
    assert_eq!(parse_capture_timestamp(raw), Some(expected));
    assert_eq!(
      parse_capture_timestamp("2020-05-01T15:30:45Z"),
      Some(
        chrono::DateTime::parse_from_rfc3339("2020-05-01T15:30:45Z")
          .expect("rfc")
          .timestamp()
      )
    );
  }
}
