//! QQ 空间同步 SQLite
//! 职责：assets 云端断点（dest_path / capture_at / cloud_state）；与相册 media.db 断层
//! 适用：catalog 覆盖、下载标记；相册拍摄时间不再反查本库

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
