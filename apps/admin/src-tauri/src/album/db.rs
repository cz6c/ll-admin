//! 相册媒体 SQLite 索引
//! 职责：扫描结果持久化、增量比对（path + modified + size）、缩略图/预览缓存路径
//! 适用：增量扫描、文件监听后的局部更新

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::types::{MediaFile, MediaGroup, MediaKind};

const DB_FILE: &str = "media.db";

/// 缩略图连续失败次数达到此阈值后跳过重试，避免对坏文件反复解码
pub const FAIL_THRESHOLD: u32 = 3;

/// 打开或初始化相册数据库
pub fn open_db(album_dir: &Path) -> Result<Connection, String> {
  let path = album_dir.join(DB_FILE);
  let conn = Connection::open(&path).map_err(|e| format!("打开相册数据库失败: {e}"))?;
  migrate(&conn)?;
  Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
  // WAL 模式：discover / 缩略图 pipeline 并发写时不再互相阻塞
  conn
    .execute_batch(
      "
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
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
        scanned_at INTEGER NOT NULL,
        fail_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_media_root ON media(root);
      CREATE INDEX IF NOT EXISTS idx_media_root_rel ON media(root, rel_dir);
      ",
    )
    .map_err(|e| format!("迁移相册表失败: {e}"))?;
  // 兼容旧库（无 fail_count 列）：补列，已存在则忽略 duplicate column 错误
  let _ = conn.execute(
    "ALTER TABLE media ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0",
    [],
  );
  Ok(())
}

/// 读取某根目录下已索引的 path → (size, modified, thumb_path, preview_path)
/// 失败计数（fail_count）请走 `load_fail_counts`，避免在此重复拉取
pub fn load_indexed_paths(
  conn: &Connection,
  root: &str,
) -> Result<HashMap<String, IndexedRow>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, size, modified, thumb_path, preview_path FROM media WHERE root = ?1",
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
}

/// 从 DB 重建 groups（缓存命中路径：dirty=false 时使用，跳过 WalkDir 全量重扫）
/// 排序与 discover_groups 对齐：rel_dir 在前，name 次之；root 目录(".")排在最前
/// dir_name 由 rel_dir 派生：根目录用 root basename，子目录用 rel_dir 最后一级
pub fn load_groups(conn: &Connection, root: &str) -> Result<Vec<MediaGroup>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT path, name, kind, size, modified, ext, thumb_path, preview_path, video_path, rel_dir
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
      let rel_dir: String = row.get(9)?;
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
      // is_file() 检查：DB 中可能残留指向已删除/损坏文件的 thumb_path
      let thumb_path: Option<String> = row.get(6)?;
      let thumb_path = thumb_path.filter(|p| Path::new(p).is_file());
      let preview_path: Option<String> = row.get(7)?;
      let preview_path = preview_path.filter(|p| Path::new(p).is_file());
      Ok((rel_dir, dir_name, MediaFile {
        path: row.get(0)?,
        name: row.get(1)?,
        kind,
        size: row.get::<_, i64>(3)? as u64,
        modified: row.get::<_, i64>(4)?,
        ext: row.get(5)?,
        thumb_path,
        preview_path,
        video_path: row.get(8)?,
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
        thumb_path, preview_path, video_path, scanned_at, fail_count
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,0)
      ON CONFLICT(path) DO UPDATE SET
        root=excluded.root, rel_dir=excluded.rel_dir, name=excluded.name,
        kind=excluded.kind, size=excluded.size, modified=excluded.modified,
        ext=excluded.ext, thumb_path=excluded.thumb_path,
        preview_path=excluded.preview_path, video_path=excluded.video_path,
        scanned_at=excluded.scanned_at,
        -- 文件已变（modified/size 不同）时重置失败计数，给坏文件一次重试机会
        fail_count = CASE
          WHEN media.modified = excluded.modified AND media.size = excluded.size
            THEN media.fail_count
          ELSE 0
        END
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

/// 一次事务内：删陈旧路径 + upsert 全部分组
/// 避免 delete 已提交、upsert 失败时 DB 既丢旧行又无新行
pub fn sync_media_index(
  conn: &Connection,
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
  for path in existing {
    if !alive.contains(path.as_str()) {
      tx.execute("DELETE FROM media WHERE path = ?1", params![path])
        .map_err(|e| format!("删除陈旧索引失败: {e}"))?;
    }
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
      )?;
    }
  }

  tx.commit()
    .map_err(|e| format!("提交索引同步事务失败: {e}"))?;
  Ok(())
}

/// 事务内批量更新缩略图/预览路径（供 pipeline 每 chunk 提交一次）
/// - thumb_path / preview_path 传 None 表示「不更新」（COALESCE 保留旧值）
/// - 成功更新时重置 fail_count
pub fn update_cache_paths_batch(
  conn: &Connection,
  updates: &[(String, Option<String>, Option<String>)],
) -> Result<(), String> {
  if updates.is_empty() {
    return Ok(());
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启缓存更新事务失败: {e}"))?;
  for (path, thumb_path, preview_path) in updates {
    tx.execute(
      "UPDATE media SET thumb_path = COALESCE(?2, thumb_path), preview_path = COALESCE(?3, preview_path), fail_count = 0 WHERE path = ?1",
      params![path, thumb_path, preview_path],
    )
    .map_err(|e| format!("更新缓存路径失败: {e}"))?;
  }
  tx.commit()
    .map_err(|e| format!("提交缓存更新事务失败: {e}"))?;
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

/// 清空所有 thumb_path / preview_path / fail_count（缓存版本升级时调用）
pub fn clear_all_cache_paths(conn: &Connection) -> Result<(), String> {
  conn
    .execute(
      "UPDATE media SET thumb_path = NULL, preview_path = NULL, fail_count = 0",
      [],
    )
    .map_err(|e| format!("清空缓存路径失败: {e}"))?;
  Ok(())
}

/// 读取单条 media 的伴生路径（Live Photo 的 mov 等）
pub fn get_media_companion_paths(
  conn: &Connection,
  path: &str,
) -> Result<(Option<String>, Option<String>, Option<String>), String> {
  match conn
    .query_row(
      "SELECT thumb_path, preview_path, video_path FROM media WHERE path = ?1",
      params![path],
      |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .map_err(|e| format!("读取媒体索引失败: {e}"))?
  {
    Some(row) => Ok(row),
    None => Ok((None, None, None)),
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
