//! QQ 空间同步 SQLite
//! 职责：assets 云端断点（dest_path / capture_at / cloud_state）；与相册 media.db 断层
//! 适用：catalog 覆盖、下载标记；相册拍摄时间不再反查本库

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;

use super::settings::qzone_sync_dir;

pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS assets (
  asset_id TEXT PRIMARY KEY,
  album_id TEXT NOT NULL,
  album_name TEXT NOT NULL DEFAULT '',
  original_filename TEXT NOT NULL DEFAULT '',
  media_kind TEXT NOT NULL DEFAULT 'image',
  capture_at TEXT,
  download_url TEXT,
  dest_path TEXT,
  cloud_state TEXT NOT NULL DEFAULT 'cloud_only',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qzone_assets_dest ON assets(dest_path);
CREATE INDEX IF NOT EXISTS idx_qzone_assets_state ON assets(cloud_state);
"#;

pub fn state_db_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(qzone_sync_dir(app)?.join("state.db"))
}

/// 打开 QQ 同步库。已有 `assets` 表则不再执行建表语句
/// @note 结构变更不写在这里：单独 SQL 手工执行后删除脚本
pub fn open_db(path: &std::path::Path) -> Result<Connection, String> {
  let conn = Connection::open(path).map_err(|e| format!("打开 QQ 空间 sync 库失败: {e}"))?;
  conn
    .busy_timeout(Duration::from_secs(5))
    .map_err(|e| format!("设置 QQ sync busy_timeout 失败: {e}"))?;
  let mode: String = conn
    .query_row("PRAGMA journal_mode", [], |row| row.get(0))
    .map_err(|e| format!("读取 journal_mode 失败: {e}"))?;
  if !mode.eq_ignore_ascii_case("wal") {
    conn
      .execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
      .map_err(|e| format!("设置 QQ sync WAL 失败: {e}"))?;
  }
  let exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='assets'",
      [],
      |_| Ok(true),
    )
    .optional()
    .map_err(|e| format!("探测 assets 失败: {e}"))?
    .unwrap_or(false);
  if !exists {
    conn
      .execute_batch(SCHEMA)
      .map_err(|e| format!("初始化 QQ 空间 sync schema 失败: {e}"))?;
  }
  Ok(conn)
}

pub fn open_app_db(app: &AppHandle) -> Result<Connection, String> {
  let path = state_db_path(app)?;
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("创建 sync 库目录失败: {e}"))?;
  }
  open_db(&path)
}

/// 写入或更新 catalog 行（保留已 synced 的 dest_path）
pub fn upsert_asset(
  conn: &Connection,
  asset_id: &str,
  album_id: &str,
  album_name: &str,
  original_filename: &str,
  media_kind: &str,
  capture_at: Option<&str>,
  download_url: &str,
) -> Result<(), String> {
  let now = chrono::Utc::now().timestamp();
  conn
    .execute(
      r#"
      INSERT INTO assets (
        asset_id, album_id, album_name, original_filename, media_kind,
        capture_at, download_url, dest_path, cloud_state, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 'cloud_only', ?8)
      ON CONFLICT(asset_id) DO UPDATE SET
        album_id = excluded.album_id,
        album_name = excluded.album_name,
        original_filename = excluded.original_filename,
        media_kind = excluded.media_kind,
        capture_at = COALESCE(excluded.capture_at, assets.capture_at),
        download_url = excluded.download_url,
        updated_at = excluded.updated_at,
        cloud_state = CASE
          WHEN assets.cloud_state = 'synced' AND assets.dest_path IS NOT NULL AND trim(assets.dest_path) != ''
            THEN assets.cloud_state
          ELSE 'cloud_only'
        END
      "#,
      params![
        asset_id,
        album_id,
        album_name,
        original_filename,
        media_kind,
        capture_at,
        download_url,
        now
      ],
    )
    .map_err(|e| format!("写入资产失败: {e}"))?;
  Ok(())
}

pub fn mark_synced(conn: &Connection, asset_id: &str, dest_path: &str) -> Result<(), String> {
  let now = chrono::Utc::now().timestamp();
  conn
    .execute(
      "UPDATE assets SET dest_path = ?2, cloud_state = 'synced', updated_at = ?3 WHERE asset_id = ?1",
      params![asset_id, dest_path, now],
    )
    .map_err(|e| format!("标记已同步失败: {e}"))?;
  Ok(())
}

pub fn count_by_state(conn: &Connection, state: &str) -> Result<u32, String> {
  conn
    .query_row(
      "SELECT COUNT(*) FROM assets WHERE cloud_state = ?1",
      params![state],
      |r| r.get::<_, i64>(0),
    )
    .map(|n| n as u32)
    .map_err(|e| format!("统计资产失败: {e}"))
}

/// 待下载：cloud_only 且有 URL；`album_id` 有值时仅该相册
/// 元组：asset_id, album_id, album_name, original_filename, capture_at, download_url, media_kind
pub fn list_pending_downloads(
  conn: &Connection,
  album_id: Option<&str>,
) -> Result<Vec<(String, String, String, String, Option<String>, String, String)>, String> {
  let sql = if album_id.is_some() {
    r#"
      SELECT asset_id, album_id, album_name, original_filename, capture_at, download_url, media_kind
      FROM assets
      WHERE cloud_state = 'cloud_only'
        AND (
          (download_url IS NOT NULL AND trim(download_url) != '')
          OR media_kind = 'video'
        )
        AND album_id = ?1
      ORDER BY capture_at ASC, asset_id ASC
      "#
  } else {
    r#"
      SELECT asset_id, album_id, album_name, original_filename, capture_at, download_url, media_kind
      FROM assets
      WHERE cloud_state = 'cloud_only'
        AND (
          (download_url IS NOT NULL AND trim(download_url) != '')
          OR media_kind = 'video'
        )
      ORDER BY capture_at ASC, asset_id ASC
      "#
  };
  let mut stmt = conn
    .prepare(sql)
    .map_err(|e| format!("准备待下载查询失败: {e}"))?;
  let map_row = |row: &rusqlite::Row| -> rusqlite::Result<_> {
    Ok((
      row.get(0)?,
      row.get(1)?,
      row.get(2)?,
      row.get(3)?,
      row.get(4)?,
      row.get::<_, Option<String>>(5)?.unwrap_or_default(),
      row.get(6)?,
    ))
  };
  let rows = if let Some(aid) = album_id {
    stmt
      .query_map(params![aid], map_row)
      .map_err(|e| format!("查询待下载失败: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("解析待下载失败: {e}"))?
  } else {
    stmt
      .query_map([], map_row)
      .map_err(|e| format!("查询待下载失败: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("解析待下载失败: {e}"))?
  };
  Ok(rows)
}

/**
 * synced 但盘上文件缺失 → 降为 cloud_only（清 dest_path）
 * @param album_id 有值时仅该相册；浏览角标与下载前调用，避免虚标「已下载」
 * @returns 降级行数
 */
pub fn reconcile_synced_missing_local_files(
  conn: &Connection,
  album_id: Option<&str>,
) -> Result<u32, String> {
  let sql = if album_id.is_some() {
    r#"
      SELECT asset_id, dest_path FROM assets
      WHERE cloud_state = 'synced'
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
        AND album_id = ?1
      "#
  } else {
    r#"
      SELECT asset_id, dest_path FROM assets
      WHERE cloud_state = 'synced'
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
      "#
  };
  let mut stmt = conn
    .prepare(sql)
    .map_err(|e| format!("准备本地缺失 reconcile 失败: {e}"))?;
  let rows = if let Some(aid) = album_id {
    stmt
      .query_map(params![aid], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
      })
      .map_err(|e| format!("查询本地缺失 reconcile 失败: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("解析本地缺失 reconcile 失败: {e}"))?
  } else {
    stmt
      .query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
      })
      .map_err(|e| format!("查询本地缺失 reconcile 失败: {e}"))?
      .collect::<Result<Vec<_>, _>>()
      .map_err(|e| format!("解析本地缺失 reconcile 失败: {e}"))?
  };

  let now = chrono::Utc::now().timestamp();
  let mut changed = 0u32;
  for (asset_id, dest_path) in rows {
    if Path::new(dest_path.trim()).is_file() {
      continue;
    }
    let n = conn
      .execute(
        r#"
        UPDATE assets
        SET dest_path = NULL, cloud_state = 'cloud_only', updated_at = ?2
        WHERE asset_id = ?1 AND cloud_state = 'synced'
        "#,
        params![asset_id, now],
      )
      .map_err(|e| format!("回写 cloud_only 失败: {e}"))?;
    changed += n as u32;
  }
  Ok(changed)
}

/**
 * 某相册（或全库）已下载 asset_id 集合：synced 且 dest_path 非空
 */
pub fn synced_asset_ids(
  conn: &Connection,
  album_id: Option<&str>,
) -> Result<std::collections::HashSet<String>, String> {
  let sql = if album_id.is_some() {
    r#"
      SELECT asset_id FROM assets
      WHERE cloud_state = 'synced'
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
        AND album_id = ?1
      "#
  } else {
    r#"
      SELECT asset_id FROM assets
      WHERE cloud_state = 'synced'
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
      "#
  };
  let mut stmt = conn
    .prepare(sql)
    .map_err(|e| format!("准备已下载查询失败: {e}"))?;
  let rows = if let Some(aid) = album_id {
    stmt
      .query_map(params![aid], |row| row.get::<_, String>(0))
      .map_err(|e| format!("查询已下载失败: {e}"))?
      .collect::<Result<std::collections::HashSet<_>, _>>()
      .map_err(|e| format!("解析已下载失败: {e}"))?
  } else {
    stmt
      .query_map([], |row| row.get::<_, String>(0))
      .map_err(|e| format!("查询已下载失败: {e}"))?
      .collect::<Result<std::collections::HashSet<_>, _>>()
      .map_err(|e| format!("解析已下载失败: {e}"))?
  };
  Ok(rows)
}

/// 云端已删：硬删 sync 行（不碰本地文件 / media.db）
pub fn delete_assets_by_ids(conn: &Connection, asset_ids: &[String]) -> Result<u32, String> {
  if asset_ids.is_empty() {
    return Ok(0);
  }
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启删 sync 行事务失败: {e}"))?;
  let mut n = 0u32;
  {
    let mut stmt = tx
      .prepare("DELETE FROM assets WHERE asset_id = ?1")
      .map_err(|e| format!("准备删 sync 行失败: {e}"))?;
    for id in asset_ids {
      n += stmt
        .execute(params![id])
        .map_err(|e| format!("删 sync 行失败: {e}"))? as u32;
    }
  }
  tx.commit()
    .map_err(|e| format!("提交删 sync 行失败: {e}"))?;
  Ok(n)
}

/// 覆盖模式：删除本次 catalog 未见的资产行（不删本地文件）
/// @param album_id 有值时仅清理该相册，避免单相册同步误删其它相册断点
pub fn purge_assets_not_in(
  conn: &Connection,
  keep_ids: &[String],
  album_id: Option<&str>,
) -> Result<u32, String> {
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启覆盖删除事务失败: {e}"))?;
  tx.execute_batch(
    "CREATE TEMP TABLE IF NOT EXISTS qzone_keep_ids (asset_id TEXT PRIMARY KEY);
     DELETE FROM qzone_keep_ids;",
  )
  .map_err(|e| format!("准备 keep 临时表失败: {e}"))?;
  {
    let mut insert = tx
      .prepare("INSERT OR IGNORE INTO qzone_keep_ids(asset_id) VALUES (?1)")
      .map_err(|e| format!("准备 keep 插入失败: {e}"))?;
    for id in keep_ids {
      insert
        .execute(params![id])
        .map_err(|e| format!("写入 keep id 失败: {e}"))?;
    }
  }
  let changed = if let Some(aid) = album_id {
    tx.execute(
      r#"
      DELETE FROM assets
      WHERE album_id = ?1
        AND asset_id NOT IN (SELECT asset_id FROM qzone_keep_ids)
      "#,
      params![aid],
    )
  } else {
    tx.execute(
      r#"
      DELETE FROM assets
      WHERE asset_id NOT IN (SELECT asset_id FROM qzone_keep_ids)
      "#,
      [],
    )
  }
  .map_err(|e| format!("覆盖删除 assets 失败: {e}"))?;
  let _ = tx.execute_batch("DROP TABLE IF EXISTS qzone_keep_ids;");
  tx.commit()
    .map_err(|e| format!("提交覆盖删除失败: {e}"))?;
  Ok(u32::try_from(changed).unwrap_or(0))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Write;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_db() -> (PathBuf, Connection) {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("qzone-sync-test-{nanos}.db"));
    let conn = open_db(&path).expect("open");
    (path, conn)
  }

  #[test]
  fn reconcile_downgrades_synced_when_file_missing() {
    let (db_path, conn) = temp_db();
    let missing = std::env::temp_dir().join(format!(
      "qzone-missing-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    upsert_asset(
      &conn,
      "a1",
      "alb",
      "相册",
      "x.jpg",
      "image",
      None,
      "https://example.com/x.jpg",
    )
    .expect("upsert");
    mark_synced(&conn, "a1", &missing.to_string_lossy()).expect("mark");

    let n = reconcile_synced_missing_local_files(&conn, Some("alb")).expect("reconcile");
    assert_eq!(n, 1);
    let synced = synced_asset_ids(&conn, Some("alb")).expect("ids");
    assert!(synced.is_empty());

    let _ = std::fs::remove_file(&db_path);
  }

  #[test]
  fn reconcile_keeps_synced_when_file_exists() {
    let (db_path, conn) = temp_db();
    let mut file = std::env::temp_dir().join(format!(
      "qzone-exists-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    {
      let mut f = std::fs::File::create(&file).expect("create");
      f.write_all(b"x").expect("write");
    }
    upsert_asset(
      &conn,
      "a2",
      "alb",
      "相册",
      "y.jpg",
      "image",
      None,
      "https://example.com/y.jpg",
    )
    .expect("upsert");
    mark_synced(&conn, "a2", &file.to_string_lossy()).expect("mark");

    let n = reconcile_synced_missing_local_files(&conn, Some("alb")).expect("reconcile");
    assert_eq!(n, 0);
    let synced = synced_asset_ids(&conn, Some("alb")).expect("ids");
    assert!(synced.contains("a2"));

    let _ = std::fs::remove_file(&file);
    let _ = std::fs::remove_file(&db_path);
    let _ = &mut file;
  }
}

