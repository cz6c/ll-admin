//! 相册媒体 SQLite 索引
//! 职责：扫描结果持久化、增量比对（path + modified + size）、缩略图/预览缓存路径
//! 适用：增量扫描、文件监听后的局部更新

use std::path::Path;

use rusqlite::{Connection, params};

use super::types::{MediaFile, MediaKind};

const DB_FILE: &str = "media.db";

/// 打开或初始化相册数据库
pub fn open_db(album_dir: &Path) -> Result<Connection, String> {
  let path = album_dir.join(DB_FILE);
  let conn = Connection::open(&path).map_err(|e| format!("打开相册数据库失败: {e}"))?;
  migrate(&conn)?;
  Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "
      CREATE TABLE IF NOT EXISTS media (
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
        video_path TEXT,
        scanned_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_root ON media(root);
      CREATE INDEX IF NOT EXISTS idx_media_root_rel ON media(root, rel_dir);
      ",
    )
    .map_err(|e| format!("迁移相册表失败: {e}"))?;
  Ok(())
}

/// 读取某根目录下已索引的 path → (size, modified, thumb_path, preview_path)
pub fn load_indexed_paths(
  conn: &Connection,
  root: &str,
) -> Result<std::collections::HashMap<String, IndexedRow>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, size, modified, thumb_path, preview_path, video_path FROM media WHERE root = ?1",
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
        video_path: row.get(5)?,
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
  pub video_path: Option<String>,
}

/// 写入或更新单条媒体索引
pub fn upsert_media(
  conn: &Connection,
  root: &str,
  rel_dir: &str,
  file: &MediaFile,
  thumb_path: Option<&str>,
  preview_path: Option<&str>,
) -> Result<(), String> {
  let kind = match file.kind {
    MediaKind::Image => "image",
    MediaKind::Video => "video",
    MediaKind::LivePhoto => "livephoto",
  };
  let scanned_at = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0);

  conn
    .execute(
      "
      INSERT INTO media(
        path, root, rel_dir, name, kind, size, modified, ext,
        thumb_path, preview_path, video_path, scanned_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
      ON CONFLICT(path) DO UPDATE SET
        root=excluded.root, rel_dir=excluded.rel_dir, name=excluded.name,
        kind=excluded.kind, size=excluded.size, modified=excluded.modified,
        ext=excluded.ext, thumb_path=excluded.thumb_path,
        preview_path=excluded.preview_path, video_path=excluded.video_path,
        scanned_at=excluded.scanned_at
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
        file.video_path,
        scanned_at,
      ],
    )
    .map_err(|e| format!("写入媒体索引失败: {e}"))?;
  Ok(())
}

/// 删除根目录下已不存在的路径
pub fn delete_stale_paths(conn: &Connection, root: &str, alive_paths: &[String]) -> Result<(), String> {
  let mut stmt = conn
    .prepare("SELECT path FROM media WHERE root = ?1")
    .map_err(|e| format!("查询陈旧路径失败: {e}"))?;
  let existing: Vec<String> = stmt
    .query_map(params![root], |row| row.get(0))
    .map_err(|e| format!("读取陈旧路径失败: {e}"))?
    .filter_map(|r| r.ok())
    .collect();

  let alive: std::collections::HashSet<&str> =
    alive_paths.iter().map(|s| s.as_str()).collect();

  for path in existing {
    if !alive.contains(path.as_str()) {
      conn
        .execute("DELETE FROM media WHERE path = ?1", params![path])
        .map_err(|e| format!("删除陈旧索引失败: {e}"))?;
    }
  }
  Ok(())
}

/// 更新单条缩略图/预览路径
pub fn update_cache_paths(
  conn: &Connection,
  path: &str,
  thumb_path: Option<&str>,
  preview_path: Option<&str>,
) -> Result<(), String> {
  conn
    .execute(
      "UPDATE media SET thumb_path = ?2, preview_path = COALESCE(?3, preview_path) WHERE path = ?1",
      params![path, thumb_path, preview_path],
    )
    .map_err(|e| format!("更新缓存路径失败: {e}"))?;
  Ok(())
}
