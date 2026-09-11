//! QQ 空间同步 SQLite
//! 职责：assets 断点（dest_path / capture_at / cloud_state）；供相册 meta 按 path 回查

use std::path::PathBuf;

use rusqlite::{params, Connection};
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

pub fn open_db(path: &std::path::Path) -> Result<Connection, String> {
  let conn = Connection::open(path).map_err(|e| format!("打开 QQ 空间 sync 库失败: {e}"))?;
  conn
    .execute_batch(SCHEMA)
    .map_err(|e| format!("初始化 QQ 空间 sync schema 失败: {e}"))?;
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

/// 供 album duplicates：已同步本地行
pub fn list_synced_dest_paths(conn: &Connection) -> Result<Vec<(String, String, String)>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT asset_id, dest_path, original_filename
      FROM assets
      WHERE cloud_state = 'synced'
        AND dest_path IS NOT NULL AND trim(dest_path) != ''
      "#,
    )
    .map_err(|e| format!("准备 synced 查询失败: {e}"))?;
  let rows = stmt
    .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
    .map_err(|e| format!("查询 synced 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 synced 失败: {e}"))?;
  Ok(rows)
}

/// 按 dest_path 查 capture_at（相册 meta）
pub fn lookup_capture_at(conn: &Connection, path: &str) -> Option<String> {
  let try_one = |p: &str| -> Option<String> {
    conn
      .query_row(
        "SELECT capture_at FROM assets
         WHERE dest_path = ?1 AND capture_at IS NOT NULL AND trim(capture_at) != ''",
        params![p],
        |r| r.get::<_, String>(0),
      )
      .ok()
  };
  try_one(path).or_else(|| {
    let norm = path.replace('\\', "/");
    if norm != path {
      try_one(&norm)
    } else {
      None
    }
  })
}
