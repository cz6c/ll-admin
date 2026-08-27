//! iCloud 同步 SQLite 断点库
//! 职责：jobs/assets 绿field schema、pending/done 查询与状态更新
//! 适用：队列 catalog 落库与串行 download 续传；不兼容旧库（版本不符则重建）

use std::path::{Path, PathBuf};

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};

use super::catalog_diff::{catalog_fingerprint, CatalogDeltaKind, ExistingAssetBaseline};

use super::settings::icloud_sync_dir;
use super::types::{
  AssetPart, AssetRow, AssetStatus, CloudState, IcloudSyncAssetTaskRow, IcloudSyncFailedAssetRow,
  JobRow, JobStatus, JobView, MediaKind,
};

const SCHEMA_VERSION: i32 = 1;

/// icloud_sync SQLite 路径
pub fn state_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(icloud_sync_dir(app)?.join("state.db"))
}

/// 打开或创建 state.db；确保为绿field 终态 schema（不匹配则丢弃重建）
pub fn open_db(db_path: &Path) -> Result<Connection, String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("创建 SQLite 目录失败: {e}"))?;
  }
  let conn = Connection::open(db_path).map_err(|e| format!("打开 SQLite 失败: {e}"))?;
  ensure_schema(&conn)?;
  Ok(conn)
}

fn schema_version(conn: &Connection) -> Result<Option<i32>, String> {
  let exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_meta'",
      [],
      |_| Ok(true),
    )
    .optional()
    .map_err(|e| format!("探测 schema_meta 失败: {e}"))?
    .unwrap_or(false);
  if !exists {
    return Ok(None);
  }
  let version: Option<i32> = conn
    .query_row(
      "SELECT CAST(value AS INTEGER) FROM schema_meta WHERE key = 'version'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("读取 schema 版本失败: {e}"))?;
  Ok(version)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
  let table_exists: bool = conn
    .query_row(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
      params![table],
      |_| Ok(true),
    )
    .optional()
    .map_err(|e| format!("探测表 {table} 失败: {e}"))?
    .unwrap_or(false);
  if !table_exists {
    return Ok(false);
  }
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

fn is_greenfield_schema(conn: &Connection) -> Result<bool, String> {
  Ok(
    schema_version(conn)? == Some(SCHEMA_VERSION)
      && column_exists(conn, "assets", "apple_id")?
      && column_exists(conn, "assets", "cloud_state")?
      && column_exists(conn, "assets", "cpl_asset_record_name")?
      && column_exists(conn, "jobs", "mode")?
      && column_exists(conn, "cloud_delete_queue", "cpl_asset_record_name")?,
  )
}

/// 绿field：只建终态表。版本或关键列不匹配 → DROP 旧表后重建（开发期无存量兼容）。
fn ensure_schema(conn: &Connection) -> Result<(), String> {
  if is_greenfield_schema(conn)? {
    return Ok(());
  }
  log::warn!(
    "icloud_sync state.db schema 非绿field 终态（version={:?}），将重建空库",
    schema_version(conn).ok().flatten()
  );
  conn
    .execute_batch(
      r#"
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS cloud_delete_queue;
      DROP TABLE IF EXISTS cloud_cursors;
      DROP TABLE IF EXISTS assets;
      DROP TABLE IF EXISTS jobs;
      DROP TABLE IF EXISTS schema_meta;
      PRAGMA foreign_keys = ON;

      CREATE TABLE schema_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        view TEXT NOT NULL,
        output_dir TEXT NOT NULL,
        apple_id TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'full',
        created_at INTEGER NOT NULL,
        finished_at INTEGER,
        total_count INTEGER NOT NULL DEFAULT 0,
        done_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        pending_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apple_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        part TEXT NOT NULL,
        sort_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        live_pair_id TEXT,
        index_num INTEGER NOT NULL,
        dest_path TEXT,
        last_error TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        cloud_state TEXT NOT NULL DEFAULT 'cloud_only',
        last_synced_at INTEGER,
        last_catalog_at INTEGER,
        download_status TEXT,
        active_job_id INTEGER,
        cpl_asset_record_name TEXT,
        cpl_asset_change_tag TEXT,
        UNIQUE(apple_id, asset_id, part)
      );

      CREATE INDEX idx_assets_state ON assets(cloud_state);
      CREATE INDEX idx_assets_dest ON assets(dest_path);
      CREATE INDEX idx_assets_apple ON assets(apple_id);
      CREATE INDEX idx_assets_active_job ON assets(active_job_id, download_status);

      CREATE TABLE cloud_cursors (
        apple_id TEXT NOT NULL,
        view TEXT NOT NULL,
        cursor TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (apple_id, view)
      );

      CREATE TABLE cloud_delete_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apple_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        part TEXT NOT NULL,
        reason TEXT NOT NULL,
        prev_cloud_state TEXT NOT NULL,
        local_path TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        cpl_asset_record_name TEXT,
        cpl_asset_change_tag TEXT,
        UNIQUE(apple_id, asset_id, part)
      );
      CREATE INDEX idx_cloud_delete_status ON cloud_delete_queue(apple_id, status);

      INSERT INTO schema_meta(key, value) VALUES('version', '1');
      "#,
    )
    .map_err(|e| format!("初始化 SQLite schema 失败: {e}"))?;
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
  mode: &str,
) -> Result<i64, String> {
  conn
    .execute(
      "INSERT INTO jobs(view, output_dir, apple_id, status, created_at, mode) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        view.as_str(),
        output_dir,
        apple_id,
        status.as_str(),
        created_at,
        mode,
      ],
    )
    .map_err(|e| format!("插入 job 失败: {e}"))?;
  Ok(conn.last_insert_rowid())
}

/// catalog diff 落库统计
#[derive(Debug, Clone, Default)]
pub struct CatalogApplySummary {
  pub added: u32,
  pub modified: u32,
  pub unchanged: u32,
  pub deleted: u32,
  pub enqueued: u32,
}

/// 读取 apple_id 下已有 assets 的 fingerprint 基线（降级 B diff）
pub fn load_existing_baselines(
  conn: &Connection,
  apple_id: &str,
) -> Result<HashMap<(String, String), ExistingAssetBaseline>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT asset_id, part, sort_key, original_filename, media_kind, cloud_state
      FROM assets WHERE apple_id = ?1
      "#,
    )
    .map_err(|e| format!("准备 baseline 查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id], |row| {
      let asset_id: String = row.get(0)?;
      let part: String = row.get(1)?;
      let sort_key: String = row.get(2)?;
      let filename: String = row.get(3)?;
      let media_kind_s: String = row.get(4)?;
      let cloud_s: String = row.get(5)?;
      let media_kind = MediaKind::parse(&media_kind_s).unwrap_or(MediaKind::Photo);
      Ok((
        (asset_id, part),
        ExistingAssetBaseline {
          fingerprint: catalog_fingerprint(&sort_key, &filename, media_kind),
          cloud_state: CloudState::parse(&cloud_s).unwrap_or(CloudState::CloudOnly),
        },
      ))
    })
    .map_err(|e| format!("查询 baseline 失败: {e}"))?
    .collect::<Result<HashMap<_, _>, _>>()
    .map_err(|e| format!("解析 baseline 失败: {e}"))?;
  Ok(rows)
}

/// 按 catalog diff 结果写入 assets；仅 added/modified 入下载队列
pub fn apply_catalog_delta(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
  classified: &[(AssetRow, CatalogDeltaKind)],
) -> Result<CatalogApplySummary, String> {
  let now = chrono::Utc::now().timestamp();
  let mut summary = CatalogApplySummary::default();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启事务失败: {e}"))?;

  for (row, kind) in classified {
    match kind {
      CatalogDeltaKind::Added => {
        summary.added += 1;
        summary.enqueued += 1;
        tx.execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind, live_pair_id,
            index_num, part, download_status, active_job_id, cloud_state, last_catalog_at,
            cpl_asset_record_name, cpl_asset_change_tag
          ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
          ON CONFLICT(apple_id, asset_id, part) DO UPDATE SET
            sort_key = excluded.sort_key,
            original_filename = excluded.original_filename,
            media_kind = excluded.media_kind,
            live_pair_id = excluded.live_pair_id,
            index_num = CASE WHEN assets.index_num > 0 THEN assets.index_num ELSE excluded.index_num END,
            download_status = 'pending',
            active_job_id = excluded.active_job_id,
            cloud_state = 'cloud_only',
            last_catalog_at = excluded.last_catalog_at,
            cpl_asset_record_name = COALESCE(excluded.cpl_asset_record_name, assets.cpl_asset_record_name),
            cpl_asset_change_tag = COALESCE(excluded.cpl_asset_change_tag, assets.cpl_asset_change_tag)
          "#,
          params![
            apple_id,
            row.asset_id,
            row.sort_key,
            row.original_filename,
            row.media_kind.as_str(),
            row.live_pair_id,
            row.index_num,
            row.part.as_str(),
            AssetStatus::Pending.as_str(),
            job_id,
            CloudState::CloudOnly.as_str(),
            now,
            row.cpl_asset_record_name,
            row.cpl_asset_change_tag,
          ],
        )
        .map_err(|e| format!("写入 added asset 失败: {e}"))?;
      }
      CatalogDeltaKind::Modified => {
        summary.modified += 1;
        summary.enqueued += 1;
        tx.execute(
          r#"
          UPDATE assets SET
            sort_key = ?1,
            original_filename = ?2,
            media_kind = ?3,
            live_pair_id = ?4,
            last_catalog_at = ?5,
            download_status = 'pending',
            active_job_id = ?6,
            cloud_state = 'modified_cloud',
            cpl_asset_record_name = COALESCE(?7, cpl_asset_record_name),
            cpl_asset_change_tag = COALESCE(?8, cpl_asset_change_tag)
          WHERE apple_id = ?9 AND asset_id = ?10 AND part = ?11
          "#,
          params![
            row.sort_key,
            row.original_filename,
            row.media_kind.as_str(),
            row.live_pair_id,
            now,
            job_id,
            row.cpl_asset_record_name,
            row.cpl_asset_change_tag,
            apple_id,
            row.asset_id,
            row.part.as_str(),
          ],
        )
        .map_err(|e| format!("写入 modified asset 失败: {e}"))?;
      }
      CatalogDeltaKind::Unchanged => {
        summary.unchanged += 1;
        tx.execute(
          r#"
          UPDATE assets SET
            sort_key = ?1,
            original_filename = ?2,
            media_kind = ?3,
            live_pair_id = ?4,
            last_catalog_at = ?5,
            cpl_asset_record_name = COALESCE(?6, cpl_asset_record_name),
            cpl_asset_change_tag = COALESCE(?7, cpl_asset_change_tag)
          WHERE apple_id = ?8 AND asset_id = ?9 AND part = ?10
          "#,
          params![
            row.sort_key,
            row.original_filename,
            row.media_kind.as_str(),
            row.live_pair_id,
            now,
            row.cpl_asset_record_name,
            row.cpl_asset_change_tag,
            apple_id,
            row.asset_id,
            row.part.as_str(),
          ],
        )
        .map_err(|e| format!("更新 unchanged asset 失败: {e}"))?;
      }
    }
  }

  tx.commit().map_err(|e| format!("提交 catalog delta 失败: {e}"))?;
  Ok(summary)
}

/// catalog 中消失的 (asset_id, part) → deleted_cloud_pending（不删本地、不入队）
pub fn mark_catalog_deletions(
  conn: &Connection,
  apple_id: &str,
  catalog_keys: &HashSet<(String, String)>,
) -> Result<u32, String> {
  let now = chrono::Utc::now().timestamp();
  let mut stmt = conn
    .prepare("SELECT asset_id, part, cloud_state FROM assets WHERE apple_id = ?1")
    .map_err(|e| format!("准备 deletion 扫描失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .map_err(|e| format!("扫描 deletion 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 deletion 行失败: {e}"))?;

  let mut changed = 0u32;
  for (asset_id, part, cloud_state) in rows {
    if catalog_keys.contains(&(asset_id.clone(), part.clone())) {
      continue;
    }
    if matches!(
      CloudState::parse(&cloud_state),
      Some(CloudState::DeletedCloudPending)
        | Some(CloudState::CloudDeleteQueued)
        | Some(CloudState::FailedDelete)
    ) {
      continue;
    }
    conn
      .execute(
        r#"
        UPDATE assets SET cloud_state = 'deleted_cloud_pending', last_catalog_at = ?1
        WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
        "#,
        params![now, apple_id, asset_id, part],
      )
      .map_err(|e| format!("标记 deleted_cloud_pending 失败: {e}"))?;
    changed += 1;
  }
  Ok(changed)
}

/// @deprecated 首版 catalog 全量入队；P2 起用 apply_catalog_delta
pub fn upsert_catalog_assets(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
  assets: &[AssetRow],
) -> Result<(), String> {
  let now = chrono::Utc::now().timestamp();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启事务失败: {e}"))?;
  for asset in assets {
    tx.execute(
      r#"
      INSERT INTO assets(
        apple_id, asset_id, sort_key, original_filename, media_kind, live_pair_id,
        index_num, part, download_status, active_job_id, cloud_state, last_catalog_at,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
      ON CONFLICT(apple_id, asset_id, part) DO UPDATE SET
        sort_key = excluded.sort_key,
        original_filename = excluded.original_filename,
        media_kind = excluded.media_kind,
        live_pair_id = excluded.live_pair_id,
        download_status = 'pending',
        active_job_id = excluded.active_job_id,
        last_catalog_at = excluded.last_catalog_at,
        index_num = CASE WHEN assets.index_num > 0 THEN assets.index_num ELSE excluded.index_num END,
        cpl_asset_record_name = COALESCE(excluded.cpl_asset_record_name, assets.cpl_asset_record_name),
        cpl_asset_change_tag = COALESCE(excluded.cpl_asset_change_tag, assets.cpl_asset_change_tag)
      "#,
      params![
        apple_id,
        asset.asset_id,
        asset.sort_key,
        asset.original_filename,
        asset.media_kind.as_str(),
        asset.live_pair_id,
        asset.index_num,
        asset.part.as_str(),
        AssetStatus::Pending.as_str(),
        job_id,
        CloudState::CloudOnly.as_str(),
        now,
        asset.cpl_asset_record_name,
        asset.cpl_asset_change_tag,
      ],
    )
    .map_err(|e| format!("upsert asset 失败: {e}"))?;
  }
  tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;
  Ok(())
}

/// catalog 结束：写入 job 快照 total/pending
pub fn set_job_catalog_counts(conn: &Connection, job_id: i64) -> Result<(), String> {
  let pending: i64 = conn
    .query_row(
      "SELECT COUNT(*) FROM assets WHERE active_job_id = ?1 AND download_status = ?2",
      params![job_id, AssetStatus::Pending.as_str()],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计 catalog pending 失败: {e}"))?;
  let p = i32::try_from(pending).map_err(|_| "pending 超出 i32".to_string())?;
  conn
    .execute(
      "UPDATE jobs SET total_count = ?1, pending_count = ?1, done_count = 0, failed_count = 0 WHERE id = ?2",
      params![p, job_id],
    )
    .map_err(|e| format!("写入 job catalog 计数失败: {e}"))?;
  Ok(())
}

/// 任务下载结束：快照计数并释放 download_status
pub fn finalize_job_download(conn: &Connection, job_id: i64) -> Result<(), String> {
  let (done, failed, pending) = count_assets_by_status(conn, job_id)?;
  let now = chrono::Utc::now().timestamp();
  conn
    .execute(
      r#"
      UPDATE jobs SET
        total_count = ?1, done_count = ?2, failed_count = ?3, pending_count = ?4, finished_at = ?5
      WHERE id = ?6
      "#,
      params![
        done + failed + pending,
        done,
        failed,
        pending,
        now,
        job_id,
      ],
    )
    .map_err(|e| format!("写入 job 快照失败: {e}"))?;
  conn
    .execute(
      "UPDATE assets SET download_status = NULL, active_job_id = NULL WHERE active_job_id = ?1",
      params![job_id],
    )
    .map_err(|e| format!("释放 job download 态失败: {e}"))?;
  Ok(())
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
  let now = chrono::Utc::now().timestamp();
  let (cloud_state, last_synced) = if status == AssetStatus::Done {
    (Some(CloudState::Synced.as_str()), Some(now))
  } else {
    (None, None)
  };
  conn
    .execute(
      r#"
      UPDATE assets SET
        download_status = ?1,
        dest_path = ?2,
        last_error = CASE WHEN ?3 = 1 THEN NULL ELSE COALESCE(?4, last_error) END,
        attempt_count = attempt_count + COALESCE(?5, 0),
        cloud_state = COALESCE(?6, cloud_state),
        last_synced_at = COALESCE(?7, last_synced_at)
      WHERE id = ?8
      "#,
      params![
        status.as_str(),
        dest_path,
        if clear_error { 1 } else { 0 },
        last_error,
        attempt_delta.unwrap_or(0),
        cloud_state,
        last_synced,
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
      r#"
      SELECT id, view, output_dir, apple_id, status,
             COALESCE(mode, 'full'), created_at, finished_at,
             COALESCE(total_count, 0), COALESCE(done_count, 0),
             COALESCE(failed_count, 0), COALESCE(pending_count, 0)
      FROM jobs WHERE id = ?1
      "#,
      params![job_id],
      |row| {
        let view_s: String = row.get(1)?;
        let status_s: String = row.get(4)?;
        Ok(JobRow {
          id: row.get(0)?,
          view: JobView::parse(&view_s).ok_or_else(|| {
            rusqlite::Error::InvalidColumnType(1, "view".into(), rusqlite::types::Type::Text)
          })?,
          output_dir: row.get(2)?,
          apple_id: row.get(3)?,
          status: JobStatus::parse(&status_s).ok_or_else(|| {
            rusqlite::Error::InvalidColumnType(4, "status".into(), rusqlite::types::Type::Text)
          })?,
          mode: row.get(5)?,
          created_at: row.get(6)?,
          finished_at: row.get(7)?,
          total_count: row.get::<_, i32>(8)? as u32,
          done_count: row.get::<_, i32>(9)? as u32,
          failed_count: row.get::<_, i32>(10)? as u32,
          pending_count: row.get::<_, i32>(11)? as u32,
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
      r#"
      UPDATE assets SET download_status = ?1, last_error = NULL
      WHERE active_job_id = ?2 AND download_status = ?3
      "#,
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
      WHERE active_job_id = ?1 AND download_status = ?2
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

/// 删除任务行；释放其占用的 download 态，不删 assets 注册表
pub fn discard_job(conn: &Connection, job_id: i64) -> Result<(), String> {
  conn
    .execute(
      "UPDATE assets SET download_status = NULL, active_job_id = NULL WHERE active_job_id = ?1",
      params![job_id],
    )
    .map_err(|e| format!("释放 job assets 失败: {e}"))?;
  conn
    .execute("DELETE FROM jobs WHERE id = ?1", params![job_id])
    .map_err(|e| format!("删除 job 失败: {e}"))?;
  Ok(())
}

/// 分页列出任务下全部/指定状态的文件行（按 index 升序）；可选文件名 keyword 子串匹配
pub fn list_asset_tasks(
  conn: &Connection,
  job_id: i64,
  offset: u32,
  limit: u32,
  status_filter: Option<AssetStatus>,
  keyword: Option<&str>,
) -> Result<(Vec<IcloudSyncAssetTaskRow>, u32), String> {
  let lim = i64::from(limit.clamp(1, 200));
  let off = i64::from(offset);
  let keyword_trimmed = keyword.map(str::trim).filter(|s| !s.is_empty());

  let mut where_parts = vec!["active_job_id = ?"];
  if status_filter.is_some() {
    where_parts.push("download_status = ?");
  }
  if keyword_trimmed.is_some() {
    where_parts.push("instr(lower(original_filename), lower(?)) > 0");
  }
  let where_clause = where_parts.join(" AND ");
  let order = "ORDER BY index_num ASC, CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC";

  let count_sql = format!("SELECT COUNT(*) FROM assets WHERE {where_clause}");
  let list_sql = format!(
    r#"
    SELECT index_num, part, original_filename, download_status, last_error, attempt_count
    FROM assets
    WHERE {where_clause}
    {order}
    LIMIT ? OFFSET ?
    "#
  );

  fn bind_asset_task_filters<'a>(
    job_id: i64,
    status_filter: Option<AssetStatus>,
    keyword: Option<&'a str>,
  ) -> Vec<Box<dyn rusqlite::ToSql + 'a>> {
    let mut params: Vec<Box<dyn rusqlite::ToSql + 'a>> = vec![Box::new(job_id)];
    if let Some(status) = status_filter {
      params.push(Box::new(status.as_str().to_string()));
    }
    if let Some(kw) = keyword {
      params.push(Box::new(kw.to_string()));
    }
    params
  }

  let filter_params = bind_asset_task_filters(job_id, status_filter, keyword_trimmed);
  let count_param_refs: Vec<&dyn rusqlite::ToSql> = filter_params.iter().map(|p| p.as_ref()).collect();
  let total: i64 = conn
    .query_row(&count_sql, count_param_refs.as_slice(), |row| row.get(0))
    .map_err(|e| format!("统计 asset 任务失败: {e}"))?;

  let mut list_params = bind_asset_task_filters(job_id, status_filter, keyword_trimmed);
  list_params.push(Box::new(lim));
  list_params.push(Box::new(off));
  let list_param_refs: Vec<&dyn rusqlite::ToSql> = list_params.iter().map(|p| p.as_ref()).collect();

  let mut stmt = conn
    .prepare(&list_sql)
    .map_err(|e| format!("准备 asset 任务查询失败: {e}"))?;
  let rows = stmt
    .query_map(list_param_refs.as_slice(), map_asset_task_row)
    .map_err(|e| format!("查询 asset 任务失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 asset 任务失败: {e}"))?;

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
      "SELECT COUNT(*) FROM assets WHERE active_job_id = ?1 AND download_status IS NOT NULL",
      params![job_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计 assets 失败: {e}"))?;
  if count > 0 {
    return Ok(true);
  }
  let job = get_job(conn, job_id)?;
  Ok(job.map(|j| j.total_count > 0).unwrap_or(false))
}

/// 按状态统计资产数量：(done, failed, pending)
pub fn count_assets_by_status(
  conn: &Connection,
  job_id: i64,
) -> Result<(u32, u32, u32), String> {
  if let Some(job) = get_job(conn, job_id)? {
    if job.status == JobStatus::Done {
      return Ok((job.done_count, job.failed_count, job.pending_count));
    }
  }
  let mut stmt = conn
    .prepare(
      "SELECT download_status, COUNT(*) FROM assets WHERE active_job_id = ?1 AND download_status IS NOT NULL GROUP BY download_status",
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
    SELECT id, apple_id, asset_id, sort_key, original_filename, media_kind,
           live_pair_id, index_num, part, download_status, active_job_id, dest_path,
           cloud_state, last_synced_at, last_catalog_at, last_error, attempt_count,
           cpl_asset_record_name, cpl_asset_change_tag
    FROM assets
    WHERE active_job_id = ?1 AND download_status IN ({placeholders})
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
  let download_s: Option<String> = row.get(9)?;
  let cloud_s: String = row.get(12)?;
  Ok(AssetRow {
    id: row.get(0)?,
    apple_id: row.get(1)?,
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
    download_status: download_s.and_then(|s| AssetStatus::parse(&s)),
    active_job_id: row.get(10)?,
    dest_path: row.get(11)?,
    cloud_state: CloudState::parse(&cloud_s).unwrap_or(CloudState::CloudOnly),
    last_synced_at: row.get(13)?,
    last_catalog_at: row.get(14)?,
    last_error: row.get(15)?,
    attempt_count: row.get(16)?,
    cpl_asset_record_name: row.get(17)?,
    cpl_asset_change_tag: row.get(18)?,
  })
}

/// 云删队列行状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudDeleteQueueStatus {
  Pending,
  Deleting,
  Done,
  Failed,
}

impl CloudDeleteQueueStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Pending => "pending",
      Self::Deleting => "deleting",
      Self::Done => "done",
      Self::Failed => "failed",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "pending" => Some(Self::Pending),
      "deleting" => Some(Self::Deleting),
      "done" => Some(Self::Done),
      "failed" => Some(Self::Failed),
      _ => None,
    }
  }
}

/// 云删队列表行（Rust 内部）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudDeleteQueueRow {
  pub id: i64,
  pub apple_id: String,
  pub asset_id: String,
  pub part: String,
  pub original_filename: String,
  pub reason: String,
  pub prev_cloud_state: String,
  pub local_path: Option<String>,
  pub status: CloudDeleteQueueStatus,
  pub attempts: u32,
  pub last_error: Option<String>,
  pub created_at: i64,
  pub updated_at: i64,
  /// 入队时从 assets 快照；sidecar 只读此字段删云
  pub cpl_asset_record_name: Option<String>,
  pub cpl_asset_change_tag: Option<String>,
}

/// 入队删云结果（rejected = missing_cpl + local_missing + 其它跳过）
#[derive(Debug, Clone, Default)]
pub struct EnqueueCloudDeleteResult {
  pub accepted: u32,
  pub rejected: u32,
  /// 缺 catalog 落库的 CPL 元数据
  pub rejected_missing_cpl: u32,
  /// dest_path 空或磁盘无文件（腾空间前必须本地在）
  pub rejected_local_missing: u32,
}

/// 腾空间硬门禁：本地非空文件必须存在，否则禁止入队删云
fn local_file_ready_for_cloud_delete(dest_path: Option<&str>) -> bool {
  let Some(p) = dest_path.map(str::trim).filter(|s| !s.is_empty()) else {
    return false;
  };
  Path::new(p).is_file()
}

/// 收集 `cloud_state=synced` 的 (asset_id, part)，供「已同步全部删云」
pub fn collect_synced_keys_for_cloud_delete(
  conn: &Connection,
  apple_id: &str,
) -> Result<Vec<(String, String)>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT asset_id, part FROM assets
      WHERE apple_id = ?1 AND cloud_state = ?2
      ORDER BY sort_key DESC, asset_id, part
      "#,
    )
    .map_err(|e| format!("准备 synced 列表失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id, CloudState::Synced.as_str()], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|e| format!("扫描 synced 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 synced 行失败: {e}"))?;
  Ok(rows)
}

const MAX_CLOUD_DELETE_ATTEMPTS: u32 = 6;

/// 启动时：中断的 deleting 行退回 pending 并 attempts++
pub fn reset_interrupted_cloud_deletes(conn: &Connection) -> Result<u32, String> {
  let now = chrono::Utc::now().timestamp();
  let changed = conn
    .execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'pending', attempts = attempts + 1, updated_at = ?1
      WHERE status = 'deleting'
      "#,
      params![now],
    )
    .map_err(|e| format!("重置中断云删队列失败: {e}"))?;
  u32::try_from(changed).map_err(|_| "重置行数超出 u32".to_string())
}

/// 全局待下载数（有 active_job 的 pending 行）
pub fn count_global_pending_downloads(conn: &Connection) -> Result<u32, String> {
  let n: i64 = conn
    .query_row(
      r#"
      SELECT COUNT(*) FROM assets
      WHERE download_status = ?1 AND active_job_id IS NOT NULL
      "#,
      params![AssetStatus::Pending.as_str()],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计 pending 下载失败: {e}"))?;
  Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

/// Live 成对：still 选中时补 mov 行（若存在）
pub fn expand_live_delete_pair(
  conn: &Connection,
  apple_id: &str,
  asset_id: &str,
  part: &str,
) -> Result<Vec<(String, String)>, String> {
  let mut keys = vec![(asset_id.to_string(), part.to_string())];
  if part != "still" {
    return Ok(keys);
  }
  let has_mov: i64 = conn
    .query_row(
      "SELECT COUNT(*) FROM assets WHERE apple_id = ?1 AND asset_id = ?2 AND part = 'mov'",
      params![apple_id, asset_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("查询 live mov 失败: {e}"))?;
  if has_mov > 0 && !keys.iter().any(|(_, p)| p == "mov") {
    keys.push((asset_id.to_string(), "mov".to_string()));
  }
  Ok(keys)
}

/// 用户发起删云：INSERT OR IGNORE queue + cloud_state=cloud_delete_queued
pub fn enqueue_cloud_deletes(
  conn: &Connection,
  apple_id: &str,
  keys: &[(String, String)],
  reason: &str,
) -> Result<EnqueueCloudDeleteResult, String> {
  let now = chrono::Utc::now().timestamp();
  let mut result = EnqueueCloudDeleteResult::default();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启云删入队事务失败: {e}"))?;

  for (asset_id, part) in keys {
    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = tx
      .query_row(
        r#"
        SELECT cloud_state, dest_path, cpl_asset_record_name, cpl_asset_change_tag
        FROM assets
        WHERE apple_id = ?1 AND asset_id = ?2 AND part = ?3
        "#,
        params![apple_id, asset_id, part],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
      )
      .optional()
      .map_err(|e| format!("读取 asset 云态失败: {e}"))?;

    let Some((cloud_state, dest_path, cpl_name, cpl_tag)) = row else {
      result.rejected += 1;
      continue;
    };
    // 无 CPLAsset 元数据无法定点删云（需重新 catalog）；禁止扫库补齐
    if cpl_name.as_deref().map(str::trim).unwrap_or("").is_empty() {
      result.rejected += 1;
      result.rejected_missing_cpl += 1;
      continue;
    }
    if cloud_state == CloudState::CloudDeleteQueued.as_str() {
      result.accepted += 1;
      continue;
    }
    // 腾空间：本地文件必须在盘；避免「云删了、本地也没了」
    if !local_file_ready_for_cloud_delete(dest_path.as_deref()) {
      result.rejected += 1;
      result.rejected_local_missing += 1;
      continue;
    }

    let inserted = tx
      .execute(
        r#"
        INSERT OR IGNORE INTO cloud_delete_queue(
          apple_id, asset_id, part, reason, prev_cloud_state, local_path,
          status, attempts, created_at, updated_at,
          cpl_asset_record_name, cpl_asset_change_tag
        ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, 'pending', 0, ?7, ?7, ?8, ?9)
        "#,
        params![
          apple_id,
          asset_id,
          part,
          reason,
          cloud_state,
          dest_path,
          now,
          cpl_name,
          cpl_tag
        ],
      )
      .map_err(|e| format!("写入 cloud_delete_queue 失败: {e}"))?;

    if inserted == 0 {
      result.accepted += 1;
    } else {
      tx.execute(
        r#"
        UPDATE assets SET cloud_state = ?1
        WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
        "#,
        params![
          CloudState::CloudDeleteQueued.as_str(),
          apple_id,
          asset_id,
          part,
        ],
      )
      .map_err(|e| format!("更新 asset cloud_delete_queued 失败: {e}"))?;
      result.accepted += 1;
    }
  }

  tx.commit().map_err(|e| format!("提交云删入队事务失败: {e}"))?;
  Ok(result)
}

/// 撤销 pending 云删：删 queue 行并恢复 prev_cloud_state
pub fn cancel_cloud_deletes(
  conn: &Connection,
  apple_id: &str,
  keys: &[(String, String)],
) -> Result<u32, String> {
  let mut cancelled = 0u32;
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启取消云删事务失败: {e}"))?;

  for (asset_id, part) in keys {
    let row: Option<(String, String)> = tx
      .query_row(
        r#"
        SELECT prev_cloud_state, status FROM cloud_delete_queue
        WHERE apple_id = ?1 AND asset_id = ?2 AND part = ?3
        "#,
        params![apple_id, asset_id, part],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .optional()
      .map_err(|e| format!("读取云删队列失败: {e}"))?;

    let Some((prev_state, status)) = row else {
      continue;
    };
    if status != CloudDeleteQueueStatus::Pending.as_str() {
      continue;
    }
    tx.execute(
      "DELETE FROM cloud_delete_queue WHERE apple_id = ?1 AND asset_id = ?2 AND part = ?3",
      params![apple_id, asset_id, part],
    )
    .map_err(|e| format!("删除云删队列行失败: {e}"))?;
    tx.execute(
      r#"
      UPDATE assets SET cloud_state = ?1
      WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
        AND cloud_state = ?5
      "#,
      params![
        prev_state,
        apple_id,
        asset_id,
        part,
        CloudState::CloudDeleteQueued.as_str(),
      ],
    )
    .map_err(|e| format!("恢复 asset cloud_state 失败: {e}"))?;
    cancelled += 1;
  }

  tx.commit().map_err(|e| format!("提交取消云删事务失败: {e}"))?;
  Ok(cancelled)
}

/// 将 failed_delete 资产重新入队
pub fn retry_failed_cloud_deletes(conn: &Connection, apple_id: &str) -> Result<u32, String> {
  let now = chrono::Utc::now().timestamp();
  let mut stmt = conn
    .prepare(
      r#"
      SELECT asset_id, part, cloud_state, dest_path,
             cpl_asset_record_name, cpl_asset_change_tag
      FROM assets
      WHERE apple_id = ?1 AND cloud_state = ?2
      "#,
    )
    .map_err(|e| format!("准备 failed_delete 扫描失败: {e}"))?;
  let rows = stmt
    .query_map(
      params![apple_id, CloudState::FailedDelete.as_str()],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, Option<String>>(3)?,
          row.get::<_, Option<String>>(4)?,
          row.get::<_, Option<String>>(5)?,
        ))
      },
    )
    .map_err(|e| format!("扫描 failed_delete 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 failed_delete 行失败: {e}"))?;

  let mut retried = 0u32;
  for (asset_id, part, prev, dest_path, cpl_name, cpl_tag) in rows {
    if cpl_name.as_deref().map(str::trim).unwrap_or("").is_empty() {
      continue;
    }
    // 与入队一致：本地不在则不重试删云，避免腾空间误伤
    if !local_file_ready_for_cloud_delete(dest_path.as_deref()) {
      continue;
    }
    conn.execute(
      r#"
      INSERT OR REPLACE INTO cloud_delete_queue(
        apple_id, asset_id, part, reason, prev_cloud_state, local_path,
        status, attempts, last_error, created_at, updated_at,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES(?1, ?2, ?3, 'retry', ?4, ?5, 'pending', 0, NULL, ?6, ?6, ?7, ?8)
      "#,
      params![apple_id, asset_id, part, prev, dest_path, now, cpl_name, cpl_tag],
    )
    .map_err(|e| format!("重试入队 failed_delete 失败: {e}"))?;
    conn.execute(
      r#"
      UPDATE assets SET cloud_state = ?1
      WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
      "#,
      params![
        CloudState::CloudDeleteQueued.as_str(),
        apple_id,
        asset_id,
        part,
      ],
    )
    .map_err(|e| format!("更新 failed_delete 为 queued 失败: {e}"))?;
    retried += 1;
  }
  Ok(retried)
}

/// 移除本地绑定：清 dest_path，cloud_state→cloud_only（不删盘）
pub fn clear_local_binding(
  conn: &Connection,
  apple_id: &str,
  asset_id: &str,
  part: &str,
) -> Result<bool, String> {
  let changed = conn
    .execute(
      r#"
      UPDATE assets SET dest_path = NULL, cloud_state = ?1
      WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
        AND dest_path IS NOT NULL
      "#,
      params![
        CloudState::CloudOnly.as_str(),
        apple_id,
        asset_id,
        part,
      ],
    )
    .map_err(|e| format!("移除本地绑定失败: {e}"))?;
  Ok(changed > 0)
}

/// 取 pending 云删批次（含文件名）
pub fn list_pending_cloud_deletes(
  conn: &Connection,
  apple_id: &str,
  limit: u32,
) -> Result<Vec<CloudDeleteQueueRow>, String> {
  let lim = i64::from(limit.clamp(1, 50));
  let mut stmt = conn
    .prepare(
      r#"
      SELECT q.id, q.apple_id, q.asset_id, q.part, a.original_filename,
             q.reason, q.prev_cloud_state, q.local_path, q.status,
             q.attempts, q.last_error, q.created_at, q.updated_at,
             q.cpl_asset_record_name, q.cpl_asset_change_tag
      FROM cloud_delete_queue q
      LEFT JOIN assets a
        ON a.apple_id = q.apple_id AND a.asset_id = q.asset_id AND a.part = q.part
      WHERE q.apple_id = ?1 AND q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT ?2
      "#,
    )
    .map_err(|e| format!("准备 pending 云删查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id, lim], |row| {
      let status_s: String = row.get(8)?;
      Ok(CloudDeleteQueueRow {
        id: row.get(0)?,
        apple_id: row.get(1)?,
        asset_id: row.get(2)?,
        part: row.get(3)?,
        original_filename: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
        reason: row.get(5)?,
        prev_cloud_state: row.get(6)?,
        local_path: row.get(7)?,
        status: CloudDeleteQueueStatus::parse(&status_s)
          .unwrap_or(CloudDeleteQueueStatus::Pending),
        attempts: row.get::<_, i32>(9)? as u32,
        last_error: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        cpl_asset_record_name: row.get(13)?,
        cpl_asset_change_tag: row.get(14)?,
      })
    })
    .map_err(|e| format!("查询 pending 云删失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 pending 云删失败: {e}"))?;
  Ok(rows)
}

pub fn mark_cloud_deletes_deleting(conn: &Connection, ids: &[i64]) -> Result<(), String> {
  if ids.is_empty() {
    return Ok(());
  }
  let now = chrono::Utc::now().timestamp();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启 deleting 事务失败: {e}"))?;
  for id in ids {
    tx.execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'deleting', updated_at = ?1
      WHERE id = ?2 AND status = 'pending'
      "#,
      params![now, id],
    )
    .map_err(|e| format!("标记 deleting 失败: {e}"))?;
  }
  tx.commit().map_err(|e| format!("提交 deleting 事务失败: {e}"))?;
  Ok(())
}

/// 云删 API 成功：删 assets 行 + queue done
pub fn finalize_cloud_delete_success(
  conn: &Connection,
  queue_id: i64,
  apple_id: &str,
  asset_id: &str,
  part: &str,
) -> Result<(), String> {
  let now = chrono::Utc::now().timestamp();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启云删成功事务失败: {e}"))?;
  tx.execute(
    "DELETE FROM assets WHERE apple_id = ?1 AND asset_id = ?2 AND part = ?3",
    params![apple_id, asset_id, part],
  )
  .map_err(|e| format!("删除 asset 行失败: {e}"))?;
  tx.execute(
    r#"
    UPDATE cloud_delete_queue
    SET status = 'done', last_error = NULL, updated_at = ?1
    WHERE id = ?2
    "#,
    params![now, queue_id],
  )
  .map_err(|e| format!("标记云删 done 失败: {e}"))?;
  tx.commit().map_err(|e| format!("提交云删成功事务失败: {e}"))?;
  Ok(())
}

/// 云删 API 失败：attempts++，≥6 次则 failed_delete
pub fn finalize_cloud_delete_failure(
  conn: &Connection,
  queue_id: i64,
  apple_id: &str,
  asset_id: &str,
  part: &str,
  error_summary: &str,
) -> Result<bool, String> {
  let now = chrono::Utc::now().timestamp();
  let attempts: i32 = conn
    .query_row(
      "SELECT attempts FROM cloud_delete_queue WHERE id = ?1",
      params![queue_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("读取云删 attempts 失败: {e}"))?;
  let next = attempts + 1;
  let terminal = u32::try_from(next).unwrap_or(MAX_CLOUD_DELETE_ATTEMPTS) >= MAX_CLOUD_DELETE_ATTEMPTS;

  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启云删失败事务失败: {e}"))?;

  if terminal {
    tx.execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'failed', attempts = ?1, last_error = ?2, updated_at = ?3
      WHERE id = ?4
      "#,
      params![next, error_summary, now, queue_id],
    )
    .map_err(|e| format!("标记云删 queue failed 失败: {e}"))?;
    tx.execute(
      r#"
      UPDATE assets SET cloud_state = ?1
      WHERE apple_id = ?2 AND asset_id = ?3 AND part = ?4
      "#,
      params![
        CloudState::FailedDelete.as_str(),
        apple_id,
        asset_id,
        part,
      ],
    )
    .map_err(|e| format!("标记 asset failed_delete 失败: {e}"))?;
  } else {
    tx.execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'pending', attempts = ?1, last_error = ?2, updated_at = ?3
      WHERE id = ?4
      "#,
      params![next, error_summary, now, queue_id],
    )
    .map_err(|e| format!("云删退回 pending 失败: {e}"))?;
  }

  tx.commit().map_err(|e| format!("提交云删失败事务失败: {e}"))?;
  Ok(terminal)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::types::{AssetStatus, CloudState};
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_db_path() -> std::path::PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    std::env::temp_dir().join(format!("icloud-sync-test-{nanos}.db"))
  }

  #[test]
  fn enqueue_cloud_delete_sets_queued_state() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let media = std::env::temp_dir().join(format!(
      "icloud-enqueue-ok-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    std::fs::write(&media, b"ok").expect("write media");
    let dest = media.to_string_lossy().to_string();
    conn.execute(
      r#"
      INSERT INTO assets(
        apple_id, asset_id, sort_key, original_filename, media_kind,
        index_num, part, download_status, cloud_state, dest_path,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES('user@icloud.com', 'A1', '2024', 'a.jpg', 'photo', 1, 'full', NULL, 'synced', ?1,
               'CPL-A1', 'tag1')
      "#,
      params![dest],
    )
    .expect("insert asset");

    let summary = enqueue_cloud_deletes(
      &conn,
      "user@icloud.com",
      &[("A1".into(), "full".into())],
      "test",
    )
    .expect("enqueue");
    assert_eq!(summary.accepted, 1);
    assert_eq!(summary.rejected, 0);
    assert_eq!(summary.rejected_local_missing, 0);

    let state: String = conn
      .query_row(
        "SELECT cloud_state FROM assets WHERE asset_id = 'A1'",
        [],
        |r| r.get(0),
      )
      .expect("state");
    assert_eq!(state, CloudState::CloudDeleteQueued.as_str());

    let pending: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM cloud_delete_queue WHERE status = 'pending'",
        [],
        |r| r.get(0),
      )
      .expect("count");
    assert_eq!(pending, 1);
    let _ = std::fs::remove_file(&media);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn enqueue_cloud_delete_rejects_when_local_file_missing() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let gone = std::env::temp_dir().join(format!(
      "icloud-enqueue-missing-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    conn.execute(
      r#"
      INSERT INTO assets(
        apple_id, asset_id, sort_key, original_filename, media_kind,
        index_num, part, download_status, cloud_state, dest_path,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES('user@icloud.com', 'A2', '2024', 'b.jpg', 'photo', 2, 'full', 'done', 'synced', ?1,
               'CPL-A2', 'tag2')
      "#,
      params![gone.to_string_lossy().to_string()],
    )
    .expect("insert");

    let summary = enqueue_cloud_deletes(
      &conn,
      "user@icloud.com",
      &[("A2".into(), "full".into())],
      "test",
    )
    .expect("enqueue");
    assert_eq!(summary.accepted, 0);
    assert_eq!(summary.rejected, 1);
    assert_eq!(summary.rejected_local_missing, 1);
    assert_eq!(summary.rejected_missing_cpl, 0);

    let queued: i64 = conn
      .query_row("SELECT COUNT(*) FROM cloud_delete_queue", [], |r| r.get(0))
      .expect("q");
    assert_eq!(queued, 0);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn collect_synced_keys_for_cloud_delete_lists_synced_parts() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let media = std::env::temp_dir().join(format!(
      "icloud-synced-all-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    std::fs::write(&media, b"ok").expect("write");
    let dest = media.to_string_lossy().to_string();
    for (id, state) in [("S1", "synced"), ("S2", "synced"), ("C1", "cloud_only")] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            index_num, part, download_status, cloud_state, dest_path,
            cpl_asset_record_name, cpl_asset_change_tag
          ) VALUES('user@icloud.com', ?1, '2024', 'x.jpg', 'photo', 1, 'full', 'done', ?2, ?3,
                   'CPL', 'tag')
          "#,
          params![id, state, dest],
        )
        .expect("insert");
    }

    let keys = collect_synced_keys_for_cloud_delete(&conn, "user@icloud.com").expect("keys");
    assert_eq!(keys.len(), 2);
    assert!(keys.iter().any(|(a, p)| a == "S1" && p == "full"));
    assert!(keys.iter().any(|(a, p)| a == "S2" && p == "full"));
    let _ = std::fs::remove_file(&media);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn ensure_schema_creates_jobs_and_assets() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='jobs'", [], |r| r.get(0))
      .unwrap();
    assert_eq!(count, 1);
    let has_cpl: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='cpl_asset_record_name'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(has_cpl, 1, "greenfield assets must include cpl_asset_record_name");
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn ensure_schema_rebuilds_legacy_job_id_shape() {
    let path = temp_db_path();
    let conn = Connection::open(&path).expect("raw open");
    conn
      .execute_batch(
        r#"
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        INSERT INTO schema_meta(key, value) VALUES('version', '1');
        CREATE TABLE jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          view TEXT NOT NULL, output_dir TEXT NOT NULL, apple_id TEXT NOT NULL,
          status TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id INTEGER NOT NULL,
          asset_id TEXT NOT NULL, sort_key TEXT NOT NULL, original_filename TEXT NOT NULL,
          media_kind TEXT NOT NULL, index_num INTEGER NOT NULL, part TEXT NOT NULL,
          status TEXT NOT NULL
        );
        "#,
      )
      .expect("legacy seed");
    drop(conn);

    let conn = open_db(&path).expect("open rebuilds");
    let has_apple: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='apple_id'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(has_apple, 1);
    let has_job_id: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='job_id'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(has_job_id, 0);
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
      "full",
    )
    .expect("job");

    let assets = vec![
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
        index_num: 1,
        part: AssetPart::Still,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: None,
        cpl_asset_change_tag: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
        index_num: 1,
        part: AssetPart::Mov,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: None,
        cpl_asset_change_tag: None,
      },
    ];
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", &assets).expect("insert");

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
      "full",
    )
    .expect("job");

    let assets = vec![
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 1,
        part: AssetPart::Full,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: None,
        cpl_asset_change_tag: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A2".into(),
        sort_key: "2024-01-02T12:00:00Z".into(),
        original_filename: "IMG_2.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 2,
        part: AssetPart::Full,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: None,
        cpl_asset_change_tag: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A3".into(),
        sort_key: "2024-01-03T12:00:00Z".into(),
        original_filename: "IMG_3.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
        index_num: 3,
        part: AssetPart::Full,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: None,
        cpl_asset_change_tag: None,
      },
    ];
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", &assets).expect("insert");

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
      "full",
    )
    .expect("job");
    update_job_status(&conn, job_id, JobStatus::PausedSession).expect("pause");
    let job = get_job(&conn, job_id).expect("get").expect("row");
    assert_eq!(job.status, JobStatus::PausedSession);
    let _ = std::fs::remove_file(path);
  }
}
