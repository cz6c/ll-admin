//! iCloud 同步 SQLite 断点库
//! 职责：jobs/assets 表迁移、pending/done 查询与状态更新
//! 适用：队列 catalog 落库与串行 download 续传

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use super::types::{
  AssetPart, AssetRow, AssetStatus, IcloudSyncAssetTaskRow, IcloudSyncFailedAssetRow, JobRow,
  JobStatus, JobView, MediaKind,
};

const SCHEMA_VERSION: i32 = 2;

/// 打开或创建 state.db 并执行迁移
pub fn open_db(db_path: &Path) -> Result<Connection, String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("创建 SQLite 目录失败: {e}"))?;
  }
  let conn = Connection::open(db_path).map_err(|e| format!("打开 SQLite 失败: {e}"))?;
  migrate(&conn)?;
  Ok(conn)
}

/// 执行 schema 迁移（幂等）
pub fn migrate(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      r#"
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        view TEXT NOT NULL,
        output_dir TEXT NOT NULL,
        apple_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL,
        sort_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        live_pair_id TEXT,
        index_num INTEGER NOT NULL,
        part TEXT NOT NULL,
        status TEXT NOT NULL,
        dest_path TEXT,
        last_error TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(job_id, asset_id, part)
      );

      CREATE INDEX IF NOT EXISTS idx_assets_job_status ON assets(job_id, status);
      CREATE INDEX IF NOT EXISTS idx_assets_job_index ON assets(job_id, index_num);
      "#,
    )
    .map_err(|e| format!("迁移 SQLite 失败: {e}"))?;

  let version: Option<i32> = conn
    .query_row(
      "SELECT CAST(value AS INTEGER) FROM schema_meta WHERE key = 'version'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取 schema 版本失败: {e}"))?;

  if version.is_none() {
    conn
      .execute(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', ?1)",
        params!["1"],
      )
      .map_err(|e| format!("写入 schema 版本失败: {e}"))?;
  }

  migrate_to_latest(&conn)?;
  Ok(())
}

fn schema_version(conn: &Connection) -> Result<i32, String> {
  let version: Option<i32> = conn
    .query_row(
      "SELECT CAST(value AS INTEGER) FROM schema_meta WHERE key = 'version'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取 schema 版本失败: {e}"))?;
  Ok(version.unwrap_or(1))
}

fn set_schema_version(conn: &Connection, version: i32) -> Result<(), String> {
  conn
    .execute(
      "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', ?1)",
      params![version.to_string()],
    )
    .map_err(|e| format!("写入 schema 版本失败: {e}"))?;
  Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
  let mut stmt = conn
    .prepare(&format!("PRAGMA table_info({table})"))
    .map_err(|e| format!("读取表结构失败: {e}"))?;
  let rows = stmt
    .query_map([], |row| row.get::<_, String>(1))
    .map_err(|e| format!("解析表结构失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("读取列名失败: {e}"))?;
  Ok(rows.iter().any(|name| name == column))
}

/// 幂等迁移至 SCHEMA_VERSION
fn migrate_to_latest(conn: &Connection) -> Result<(), String> {
  let mut version = schema_version(conn)?;
  if version < 2 {
    if !column_exists(conn, "assets", "last_error")? {
      conn
        .execute("ALTER TABLE assets ADD COLUMN last_error TEXT", [])
        .map_err(|e| format!("添加 last_error 列失败: {e}"))?;
    }
    if !column_exists(conn, "assets", "attempt_count")? {
      conn
        .execute(
          "ALTER TABLE assets ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0",
          [],
        )
        .map_err(|e| format!("添加 attempt_count 列失败: {e}"))?;
    }
    version = 2;
    set_schema_version(conn, version)?;
  }
  Ok(())
}

/// 插入任务行，返回自增 id
pub fn insert_job(
  conn: &Connection,
  view: JobView,
  output_dir: &str,
  apple_id: &str,
  status: JobStatus,
  created_at: i64,
) -> Result<i64, String> {
  conn
    .execute(
      "INSERT INTO jobs(view, output_dir, apple_id, status, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
      params![
        view.as_str(),
        output_dir,
        apple_id,
        status.as_str(),
        created_at,
      ],
    )
    .map_err(|e| format!("插入 job 失败: {e}"))?;
  Ok(conn.last_insert_rowid())
}

/// 批量插入资产行
pub fn insert_assets(conn: &Connection, assets: &[AssetRow]) -> Result<(), String> {
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启事务失败: {e}"))?;
  for asset in assets {
    tx.execute(
      r#"
      INSERT INTO assets(
        job_id, asset_id, sort_key, original_filename, media_kind,
        live_pair_id, index_num, part, status, dest_path, last_error, attempt_count
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
      "#,
      params![
        asset.job_id,
        asset.asset_id,
        asset.sort_key,
        asset.original_filename,
        asset.media_kind.as_str(),
        asset.live_pair_id,
        asset.index_num,
        asset.part.as_str(),
        asset.status.as_str(),
        asset.dest_path,
        asset.last_error,
        asset.attempt_count,
      ],
    )
    .map_err(|e| format!("插入 asset 失败: {e}"))?;
  }
  tx.commit().map_err(|e| format!("提交事务失败: {e}"))
}

/// 更新任务状态
pub fn update_job_status(conn: &Connection, job_id: i64, status: JobStatus) -> Result<(), String> {
  conn
    .execute(
      "UPDATE jobs SET status = ?1 WHERE id = ?2",
      params![status.as_str(), job_id],
    )
    .map(|_| ())
    .map_err(|e| format!("更新 job 状态失败: {e}"))
}

/// 标记单资产状态；可选写入最终落盘路径与失败摘要
pub fn mark_asset_status(
  conn: &Connection,
  asset_row_id: i64,
  status: AssetStatus,
  dest_path: Option<&str>,
) -> Result<(), String> {
  mark_asset_outcome(conn, asset_row_id, status, dest_path, None, None)
}

/// 更新资产结果：done 清 last_error；failed 写入摘要并递增 attempt_count
pub fn mark_asset_outcome(
  conn: &Connection,
  asset_row_id: i64,
  status: AssetStatus,
  dest_path: Option<&str>,
  last_error: Option<&str>,
  attempt_delta: Option<i32>,
) -> Result<(), String> {
  let clear_error = status == AssetStatus::Done;
  conn
    .execute(
      r#"
      UPDATE assets SET
        status = ?1,
        dest_path = ?2,
        last_error = CASE WHEN ?3 = 1 THEN NULL ELSE COALESCE(?4, last_error) END,
        attempt_count = attempt_count + COALESCE(?5, 0)
      WHERE id = ?6
      "#,
      params![
        status.as_str(),
        dest_path,
        if clear_error { 1 } else { 0 },
        last_error,
        attempt_delta.unwrap_or(0),
        asset_row_id,
      ],
    )
    .map(|_| ())
    .map_err(|e| format!("更新 asset 状态失败: {e}"))
}

/// 读取任务
pub fn get_job(conn: &Connection, job_id: i64) -> Result<Option<JobRow>, String> {
  conn
    .query_row(
      "SELECT id, view, output_dir, apple_id, status, created_at FROM jobs WHERE id = ?1",
      params![job_id],
      |row| {
        let view_s: String = row.get(1)?;
        let status_s: String = row.get(4)?;
        Ok(JobRow {
          id: row.get(0)?,
          view: JobView::parse(&view_s).ok_or_else(|| rusqlite::Error::InvalidColumnType(1, "view".into(), rusqlite::types::Type::Text))?,
          output_dir: row.get(2)?,
          apple_id: row.get(3)?,
          status: JobStatus::parse(&status_s).ok_or_else(|| rusqlite::Error::InvalidColumnType(4, "status".into(), rusqlite::types::Type::Text))?,
          created_at: row.get(5)?,
        })
      },
    )
    .optional()
    .map_err(|e| format!("读取 job 失败: {e}"))
}

/// 待下载资产（仅 `pending`；`failed` 由 resume 时 reset 后再入队）
pub fn list_pending_assets(conn: &Connection, job_id: i64) -> Result<Vec<AssetRow>, String> {
  list_assets_by_statuses(conn, job_id, &[AssetStatus::Pending])
}

/// resume 时将 failed 资产重置为 pending，供新一轮下载重试
pub fn reset_failed_to_pending(conn: &Connection, job_id: i64) -> Result<u32, String> {
  let changed = conn
    .execute(
      "UPDATE assets SET status = ?1, last_error = NULL WHERE job_id = ?2 AND status = ?3",
      params![
        AssetStatus::Pending.as_str(),
        job_id,
        AssetStatus::Failed.as_str(),
      ],
    )
    .map_err(|e| format!("重置 failed 资产失败: {e}"))?;
  u32::try_from(changed).map_err(|_| "重置行数超出 u32".to_string())
}

/// 列出失败资产（按 index 升序，供同步页表格）
pub fn list_failed_assets(
  conn: &Connection,
  job_id: i64,
  limit: u32,
) -> Result<Vec<IcloudSyncFailedAssetRow>, String> {
  let lim = i64::from(limit.max(1));
  let mut stmt = conn
    .prepare(
      r#"
      SELECT index_num, part, original_filename, last_error, attempt_count
      FROM assets
      WHERE job_id = ?1 AND status = ?2
      ORDER BY index_num ASC,
               CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
      LIMIT ?3
      "#,
    )
    .map_err(|e| format!("准备 failed 查询失败: {e}"))?;
  let rows = stmt
    .query_map(
      params![job_id, AssetStatus::Failed.as_str(), lim],
      |row| {
        Ok(IcloudSyncFailedAssetRow {
          index_num: row.get(0)?,
          part: row.get(1)?,
          original_filename: row.get(2)?,
          last_error: row
            .get::<_, Option<String>>(3)?
            .unwrap_or_else(|| "download_failed".to_string()),
          attempt_count: row.get(4)?,
        })
      },
    )
    .map_err(|e| format!("查询 failed 资产失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 failed 资产失败: {e}"))?;
  Ok(rows)
}

/// 分页列出任务下全部/指定状态的文件行（按 index 升序）
pub fn list_asset_tasks(
  conn: &Connection,
  job_id: i64,
  offset: u32,
  limit: u32,
  status_filter: Option<AssetStatus>,
) -> Result<(Vec<IcloudSyncAssetTaskRow>, u32), String> {
  let lim = i64::from(limit.clamp(1, 200));
  let off = i64::from(offset);

  let total: i64 = match status_filter {
    Some(status) => conn.query_row(
      "SELECT COUNT(*) FROM assets WHERE job_id = ?1 AND status = ?2",
      params![job_id, status.as_str()],
      |row| row.get(0),
    ),
    None => conn.query_row(
      "SELECT COUNT(*) FROM assets WHERE job_id = ?1",
      params![job_id],
      |row| row.get(0),
    ),
  }
  .map_err(|e| format!("统计 asset 任务失败: {e}"))?;

  let rows = match status_filter {
    Some(status) => {
      let mut stmt = conn
        .prepare(
          r#"
          SELECT index_num, part, original_filename, status, last_error, attempt_count
          FROM assets
          WHERE job_id = ?1 AND status = ?2
          ORDER BY index_num ASC,
                   CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
          LIMIT ?3 OFFSET ?4
          "#,
        )
        .map_err(|e| format!("准备 asset 任务查询失败: {e}"))?;
      let mapped = stmt
        .query_map(
          params![job_id, status.as_str(), lim, off],
          map_asset_task_row,
        )
        .map_err(|e| format!("查询 asset 任务失败: {e}"))?;
      mapped
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("解析 asset 任务失败: {e}"))?
    }
    None => {
      let mut stmt = conn
        .prepare(
          r#"
          SELECT index_num, part, original_filename, status, last_error, attempt_count
          FROM assets
          WHERE job_id = ?1
          ORDER BY index_num ASC,
                   CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
          LIMIT ?2 OFFSET ?3
          "#,
        )
        .map_err(|e| format!("准备 asset 任务查询失败: {e}"))?;
      let mapped = stmt
        .query_map(params![job_id, lim, off], map_asset_task_row)
        .map_err(|e| format!("查询 asset 任务失败: {e}"))?;
      mapped
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("解析 asset 任务失败: {e}"))?
    }
  };

  let total_u32 = u32::try_from(total).map_err(|_| "任务总数超出 u32".to_string())?;
  Ok((rows, total_u32))
}

fn map_asset_task_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<IcloudSyncAssetTaskRow> {
  Ok(IcloudSyncAssetTaskRow {
    index_num: row.get(0)?,
    part: row.get(1)?,
    original_filename: row.get(2)?,
    status: row.get(3)?,
    last_error: row.get(4)?,
    attempt_count: row.get(5)?,
  })
}

/// 已完成资产（测试与后续 UI 统计用）
#[cfg(test)]
pub fn list_done_assets(conn: &Connection, job_id: i64) -> Result<Vec<AssetRow>, String> {
  list_assets_by_statuses(conn, job_id, &[AssetStatus::Done])
}

/// 任务下是否存在任意资产行（resume 判断是否跳过 re-catalog）
pub fn job_has_assets(conn: &Connection, job_id: i64) -> Result<bool, String> {
  let count: i64 = conn
    .query_row(
      "SELECT COUNT(*) FROM assets WHERE job_id = ?1",
      params![job_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计 assets 失败: {e}"))?;
  Ok(count > 0)
}

/// 按状态统计资产数量：(done, failed, pending)
pub fn count_assets_by_status(
  conn: &Connection,
  job_id: i64,
) -> Result<(u32, u32, u32), String> {
  let mut stmt = conn
    .prepare(
      "SELECT status, COUNT(*) FROM assets WHERE job_id = ?1 GROUP BY status",
    )
    .map_err(|e| format!("准备统计查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![job_id], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })
    .map_err(|e| format!("统计 assets 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析统计行失败: {e}"))?;

  let mut done = 0u32;
  let mut failed = 0u32;
  let mut pending = 0u32;
  for (status, count) in rows {
    let n = u32::try_from(count).unwrap_or(u32::MAX);
    match AssetStatus::parse(&status) {
      Some(AssetStatus::Done) => done = n,
      Some(AssetStatus::Failed) => failed = n,
      Some(AssetStatus::Pending) => pending = n,
      None => {}
    }
  }
  Ok((done, failed, pending))
}

fn list_assets_by_statuses(
  conn: &Connection,
  job_id: i64,
  statuses: &[AssetStatus],
) -> Result<Vec<AssetRow>, String> {
  if statuses.is_empty() {
    return Ok(Vec::new());
  }
  let placeholders = statuses
    .iter()
    .map(|_| "?")
    .collect::<Vec<_>>()
    .join(", ");
  let sql = format!(
    r#"
    SELECT id, job_id, asset_id, sort_key, original_filename, media_kind,
           live_pair_id, index_num, part, status, dest_path, last_error, attempt_count
    FROM assets
    WHERE job_id = ?1 AND status IN ({placeholders})
    ORDER BY index_num ASC,
             CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC
    "#
  );

  let mut stmt = conn.prepare(&sql).map_err(|e| format!("准备查询失败: {e}"))?;
  let status_strs: Vec<&str> = statuses.iter().map(|s| s.as_str()).collect();
  let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(job_id)];
  for s in &status_strs {
    params_vec.push(Box::new(*s));
  }
  let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

  let rows = stmt
    .query_map(param_refs.as_slice(), map_asset_row)
    .map_err(|e| format!("查询 assets 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 assets 行失败: {e}"))?;
  Ok(rows)
}

fn map_asset_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AssetRow> {
  let media_kind_s: String = row.get(5)?;
  let part_s: String = row.get(8)?;
  let status_s: String = row.get(9)?;
  Ok(AssetRow {
    id: row.get(0)?,
    job_id: row.get(1)?,
    asset_id: row.get(2)?,
    sort_key: row.get(3)?,
    original_filename: row.get(4)?,
    media_kind: MediaKind::parse(&media_kind_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(5, "media_kind".into(), rusqlite::types::Type::Text)
    })?,
    live_pair_id: row.get(6)?,
    index_num: row.get(7)?,
    part: AssetPart::parse(&part_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(8, "part".into(), rusqlite::types::Type::Text)
    })?,
    status: AssetStatus::parse(&status_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(9, "status".into(), rusqlite::types::Type::Text)
    })?,
    dest_path: row.get(10)?,
    last_error: row.get(11)?,
    attempt_count: row.get(12)?,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::types::AssetStatus;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_db_path() -> std::path::PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    std::env::temp_dir().join(format!("icloud-sync-test-{nanos}.db"))
  }

  #[test]
  fn migrate_creates_jobs_and_assets() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='jobs'", [], |r| r.get(0))
      .unwrap();
    assert_eq!(count, 1);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn live_parts_share_index_num() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Pending,
      1,
    )
    .expect("job");

    let assets = vec![
      AssetRow {
        id: 0,
        job_id,
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
        index_num: 1,
        part: AssetPart::Still,
        status: AssetStatus::Pending,
        dest_path: None,
        last_error: None,
        attempt_count: 0,
      },
      AssetRow {
        id: 0,
        job_id,
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
        index_num: 1,
        part: AssetPart::Mov,
        status: AssetStatus::Pending,
        dest_path: None,
        last_error: None,
        attempt_count: 0,
      },
    ];
    insert_assets(&conn, &assets).expect("insert");

    let pending = list_pending_assets(&conn, job_id).expect("pending");
    assert_eq!(pending.len(), 2);
    assert!(pending.iter().all(|a| a.index_num == 1));
    assert_eq!(pending[0].part, AssetPart::Still);
    assert_eq!(pending[1].part, AssetPart::Mov);

    mark_asset_status(&conn, pending[0].id, AssetStatus::Done, Some("C:\\out\\00001_x.jpg"))
      .expect("mark still");
    let done = list_done_assets(&conn, job_id).expect("done");
    assert_eq!(done.len(), 1);
    assert_eq!(done[0].part, AssetPart::Still);

    let still_pending = list_pending_assets(&conn, job_id).expect("pending after still");
    assert_eq!(still_pending.len(), 1);
    assert_eq!(still_pending[0].part, AssetPart::Mov);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn list_pending_skips_failed_returns_next_pending() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Running,
      1,
    )
    .expect("job");

    let assets = vec![
      AssetRow {
        id: 0,
        job_id,
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 1,
        part: AssetPart::Full,
        status: AssetStatus::Pending,
        dest_path: None,
        last_error: None,
        attempt_count: 0,
      },
      AssetRow {
        id: 0,
        job_id,
        asset_id: "A2".into(),
        sort_key: "2024-01-02T12:00:00Z".into(),
        original_filename: "IMG_2.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 2,
        part: AssetPart::Full,
        status: AssetStatus::Pending,
        dest_path: None,
        last_error: None,
        attempt_count: 0,
      },
      AssetRow {
        id: 0,
        job_id,
        asset_id: "A3".into(),
        sort_key: "2024-01-03T12:00:00Z".into(),
        original_filename: "IMG_3.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 3,
        part: AssetPart::Full,
        status: AssetStatus::Pending,
        dest_path: None,
        last_error: None,
        attempt_count: 0,
      },
    ];
    insert_assets(&conn, &assets).expect("insert");

    let first = list_pending_assets(&conn, job_id).expect("pending")[0].clone();
    mark_asset_status(&conn, first.id, AssetStatus::Failed, None).expect("fail first");

    let pending = list_pending_assets(&conn, job_id).expect("pending after fail");
    assert_eq!(pending.len(), 2);
    assert_eq!(pending[0].asset_id, "A2");
    assert_eq!(pending[0].index_num, 2);
    assert_eq!(pending[1].asset_id, "A3");

    let reset = reset_failed_to_pending(&conn, job_id).expect("reset");
    assert_eq!(reset, 1);
    let requeued = list_pending_assets(&conn, job_id).expect("pending after reset");
    assert_eq!(requeued.len(), 3);
    assert_eq!(requeued[0].asset_id, "A1");

    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn paused_session_job_status_roundtrip() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      JobView::Recents,
      "D:\\sync",
      "a@b.com",
      JobStatus::Running,
      100,
    )
    .expect("job");
    update_job_status(&conn, job_id, JobStatus::PausedSession).expect("pause");
    let job = get_job(&conn, job_id).expect("get").expect("row");
    assert_eq!(job.status, JobStatus::PausedSession);
    let _ = std::fs::remove_file(path);
  }
}
