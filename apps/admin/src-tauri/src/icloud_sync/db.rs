//! iCloud 同步 SQLite 断点库
//! 职责：jobs/assets 终态 schema、pending/done 查询与状态更新
//! 适用：队列 catalog 落库与串行 download 续传
//! @note schema 只认 `PRAGMA user_version = 5` 终态；已砍 v2–v4 链式迁移与 index_num 残留清理。
//!       无业务表 → 建终态；user_version∈{0,1} 怪库 → 重建空库；其它非 5 → 报错不清空。

use std::path::{Path, PathBuf};

use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};

use super::catalog_diff::{catalog_fingerprint, CatalogDeltaKind, ExistingAssetBaseline};

use super::settings::icloud_sync_dir;
use super::types::{
  AssetPart, AssetRow, AssetStatus, CloudState, IcloudSyncAssetTaskRow, IcloudSyncFailedAssetRow,
  JobRow, JobStatus, JobView, MediaKind, TaskType,
};

/// 应用期望的 state.db schema 代际（历史迁移已收口，数字保持 5 以免现网重标定）
const SCHEMA_VERSION: i32 = 5;

/// icloud_sync SQLite 路径
pub fn state_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  Ok(icloud_sync_dir(app)?.join("state.db"))
}

/// 打开或创建 state.db；仅接受终态 `user_version = SCHEMA_VERSION`
pub fn open_db(db_path: &Path) -> Result<Connection, String> {
  if let Some(parent) = db_path.parent() {
    std::fs::create_dir_all(parent).map_err(|e| format!("创建 SQLite 目录失败: {e}"))?;
  }
  let conn = Connection::open(db_path).map_err(|e| format!("打开 SQLite 失败: {e}"))?;
  ensure_schema(&conn)?;
  Ok(conn)
}

fn user_version(conn: &Connection) -> Result<i32, String> {
  conn
    .query_row("PRAGMA user_version", [], |row| row.get(0))
    .map_err(|e| format!("读取 user_version 失败: {e}"))
}

fn set_user_version(conn: &Connection, version: i32) -> Result<(), String> {
  // PRAGMA 不支持绑定参数
  conn
    .execute_batch(&format!("PRAGMA user_version = {version};"))
    .map_err(|e| format!("写入 user_version={version} 失败: {e}"))
}

/// 一次性兼容：旧库若仍有 `schema_meta`，把 version 灌入 pragma（仅当 user_version=0）并删表
fn absorb_legacy_schema_meta(conn: &Connection) -> Result<(), String> {
  if !table_exists(conn, "schema_meta")? {
    return Ok(());
  }
  let cur = user_version(conn)?;
  if cur == 0 {
    let meta_ver: Option<i32> = conn
      .query_row(
        "SELECT CAST(value AS INTEGER) FROM schema_meta WHERE key = 'version'",
        [],
        |row| row.get(0),
      )
      .optional()
      .map_err(|e| format!("读取旧 schema_meta.version 失败: {e}"))?;
    if let Some(v) = meta_ver {
      set_user_version(conn, v)?;
      log::info!("icloud_sync state.db: schema_meta.version={v} → user_version");
    }
  }
  conn
    .execute("DROP TABLE IF EXISTS schema_meta", [])
    .map_err(|e| format!("删除旧 schema_meta 失败: {e}"))?;
  Ok(())
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

/// 终态建表（无 schema_meta；版本只写 pragma）
fn create_final_schema(conn: &Connection) -> Result<(), String> {
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

      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT NOT NULL DEFAULT 'sync',
        view TEXT NOT NULL,
        output_dir TEXT NOT NULL,
        apple_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        finished_at INTEGER,
        total_count INTEGER NOT NULL DEFAULT 0,
        done_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        pending_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_jobs_apple_status ON jobs(apple_id, status);

      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apple_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        part TEXT NOT NULL,
        sort_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        media_kind TEXT NOT NULL,
        live_pair_id TEXT,
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
        capture_at TEXT,
        added_at TEXT,
        latitude REAL,
        longitude REAL,
        UNIQUE(apple_id, asset_id, part)
      );

      CREATE INDEX idx_assets_state ON assets(cloud_state);
      CREATE INDEX idx_assets_dest ON assets(dest_path);
      CREATE INDEX idx_assets_apple ON assets(apple_id);
      CREATE INDEX idx_assets_active_job ON assets(active_job_id, download_status);
      CREATE INDEX idx_assets_capture_at ON assets(apple_id, capture_at);

      CREATE TABLE cloud_delete_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
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
      CREATE INDEX idx_cloud_delete_job ON cloud_delete_queue(job_id, status);
      "#,
    )
    .map_err(|e| format!("初始化 SQLite schema 失败: {e}"))?;
  set_user_version(conn, SCHEMA_VERSION)?;
  Ok(())
}

/// 只认终态 `user_version = SCHEMA_VERSION`；无历史链式迁移
fn ensure_schema(conn: &Connection) -> Result<(), String> {
  absorb_legacy_schema_meta(conn)?;
  let cur = user_version(conn)?;
  let has_business = table_exists(conn, "assets")? || table_exists(conn, "jobs")?;

  if !has_business {
    create_final_schema(conn)?;
    return Ok(());
  }

  if cur > SCHEMA_VERSION {
    return Err(format!(
      "icloud_sync state.db user_version={cur} 新于应用 SCHEMA_VERSION={SCHEMA_VERSION}，请升级客户端"
    ));
  }

  if cur == SCHEMA_VERSION {
    return Ok(());
  }

  // 0/1：古董/不可识别形态 → 重建空库（与旧「version=1 怪形态」一致）
  if matches!(cur, 0 | 1) {
    log::warn!(
      "icloud_sync state.db 不可识别 user_version={cur}，将重建空库"
    );
    create_final_schema(conn)?;
    return Ok(());
  }

  // 2/3/4 等：已不再提供自动迁移，避免误 wipe；需人工处理或删库重同步
  Err(format!(
    "icloud_sync state.db user_version={cur} 低于终态 {SCHEMA_VERSION}，本版本已取消自动升级，已中止且未清空数据库"
  ))
}

/// 插入任务行，返回自增 id
pub fn insert_job(
  conn: &Connection,
  task_type: TaskType,
  view: JobView,
  output_dir: &str,
  apple_id: &str,
  status: JobStatus,
  created_at: i64,
) -> Result<i64, String> {
  conn
    .execute(
      "INSERT INTO jobs(task_type, view, output_dir, apple_id, status, created_at) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        task_type.as_str(),
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

/// 当前账号未完成任务（至多一条）
pub fn find_incomplete_task_for_apple(
  conn: &Connection,
  apple_id: &str,
) -> Result<Option<JobRow>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT id, COALESCE(task_type, 'sync'), view, output_dir, apple_id, status,
             created_at, finished_at,
             COALESCE(total_count, 0), COALESCE(done_count, 0),
             COALESCE(failed_count, 0), COALESCE(pending_count, 0)
      FROM jobs
      WHERE apple_id = ?1
        AND status IN ('cataloging', 'pending', 'running', 'paused_session', 'paused_user')
      ORDER BY id DESC
      LIMIT 1
      "#,
    )
    .map_err(|e| format!("准备未完成任务查询失败: {e}"))?;
  let row = stmt
    .query_row(params![apple_id], map_job_row)
    .optional()
    .map_err(|e| format!("查询未完成任务失败: {e}"))?;
  Ok(row)
}

fn map_job_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JobRow> {
  let view_s: String = row.get(2)?;
  let status_s: String = row.get(5)?;
  let task_type_s: String = row.get(1)?;
  Ok(JobRow {
    id: row.get(0)?,
    task_type: TaskType::parse(&task_type_s).unwrap_or(TaskType::Sync),
    view: JobView::parse(&view_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(2, "view".into(), rusqlite::types::Type::Text)
    })?,
    output_dir: row.get(3)?,
    apple_id: row.get(4)?,
    status: JobStatus::parse(&status_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(5, "status".into(), rusqlite::types::Type::Text)
    })?,
    // schema v5 无 jobs.mode；API 占位恒为 full
    mode: "full".into(),
    created_at: row.get(6)?,
    finished_at: row.get(7)?,
    total_count: row.get::<_, i32>(8)? as u32,
    done_count: row.get::<_, i32>(9)? as u32,
    failed_count: row.get::<_, i32>(10)? as u32,
    pending_count: row.get::<_, i32>(11)? as u32,
  })
}

/// catalog diff 落库统计
#[derive(Debug, Clone, Default)]
pub struct CatalogApplySummary {
  pub added: u32,
  pub modified: u32,
  /// fingerprint/changeTag 未变，仅刷新产品元数据
  pub metadata_refresh: u32,
  pub unchanged: u32,
  /// Unchanged 且跳过逐行 UPDATE（仅批量 touch last_catalog_at）
  pub unchanged_skipped: u32,
  pub deleted: u32,
  pub enqueued: u32,
}

const CATALOG_KEYS_TEMP: &str = "catalog_keys_temp";
const CATALOG_TOUCH_TEMP: &str = "catalog_touch_temp";

/// 写入 catalog diff 批处理用的临时键表（同连接内 mark/enqueue/reconcile 复用）
pub fn prepare_catalog_keys_temp(
  conn: &Connection,
  catalog_keys: &HashSet<(String, String)>,
) -> Result<(), String> {
  conn
    .execute_batch(&format!(
      r#"
      CREATE TEMP TABLE IF NOT EXISTS {CATALOG_KEYS_TEMP} (
        asset_id TEXT NOT NULL,
        part TEXT NOT NULL,
        PRIMARY KEY (asset_id, part)
      );
      DELETE FROM {CATALOG_KEYS_TEMP};
      "#
    ))
    .map_err(|e| format!("准备 catalog_keys_temp 失败: {e}"))?;
  if catalog_keys.is_empty() {
    return Ok(());
  }
  let mut stmt = conn
    .prepare(&format!(
      "INSERT OR IGNORE INTO {CATALOG_KEYS_TEMP}(asset_id, part) VALUES (?1, ?2)"
    ))
    .map_err(|e| format!("准备 catalog_keys_temp 插入失败: {e}"))?;
  for (asset_id, part) in catalog_keys {
    stmt
      .execute(params![asset_id, part])
      .map_err(|e| format!("写入 catalog_keys_temp 失败: {e}"))?;
  }
  drop(stmt);
  Ok(())
}

fn batch_touch_last_catalog_at(
  conn: &Connection,
  apple_id: &str,
  now: i64,
  keys: &[(String, String)],
) -> Result<(), String> {
  if keys.is_empty() {
    return Ok(());
  }
  conn
    .execute_batch(&format!(
      r#"
      CREATE TEMP TABLE IF NOT EXISTS {CATALOG_TOUCH_TEMP} (
        asset_id TEXT NOT NULL,
        part TEXT NOT NULL,
        PRIMARY KEY (asset_id, part)
      );
      DELETE FROM {CATALOG_TOUCH_TEMP};
      "#
    ))
    .map_err(|e| format!("准备 catalog_touch_temp 失败: {e}"))?;
  let mut stmt = conn
    .prepare(&format!(
      "INSERT OR IGNORE INTO {CATALOG_TOUCH_TEMP}(asset_id, part) VALUES (?1, ?2)"
    ))
    .map_err(|e| format!("准备 catalog_touch_temp 插入失败: {e}"))?;
  for (asset_id, part) in keys {
    stmt
      .execute(params![asset_id, part])
      .map_err(|e| format!("写入 catalog_touch_temp 失败: {e}"))?;
  }
  drop(stmt);
  conn
    .execute(
      &format!(
        r#"
        UPDATE assets SET last_catalog_at = ?1
        WHERE apple_id = ?2
          AND EXISTS (
            SELECT 1 FROM {CATALOG_TOUCH_TEMP} t
            WHERE t.asset_id = assets.asset_id AND t.part = assets.part
          )
        "#
      ),
      params![now, apple_id],
    )
    .map_err(|e| format!("批量 touch last_catalog_at 失败: {e}"))?;
  Ok(())
}

/// 读取 apple_id 下已有 assets 的 fingerprint 基线（降级 B diff）
pub fn load_existing_baselines(
  conn: &Connection,
  apple_id: &str,
) -> Result<HashMap<(String, String), ExistingAssetBaseline>, String> {
  let mut stmt = conn
    .prepare(
      r#"
      SELECT asset_id, part, sort_key, original_filename, media_kind, cloud_state,
             cpl_asset_record_name, cpl_asset_change_tag,
             capture_at, added_at, latitude, longitude
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
          cpl_asset_record_name: row.get(6)?,
          cpl_asset_change_tag: row.get(7)?,
          capture_at: row.get(8)?,
          added_at: row.get(9)?,
          latitude: row.get(10)?,
          longitude: row.get(11)?,
        },
      ))
    })
    .map_err(|e| format!("查询 baseline 失败: {e}"))?
    .collect::<Result<HashMap<_, _>, _>>()
    .map_err(|e| format!("解析 baseline 失败: {e}"))?;
  Ok(rows)
}

/// 按 catalog diff 结果写入 assets。
/// `queue_downloads=true` 时 added/modified 写入 pending（旧「扫完即下」）；刷新目录应为 false，仅更新云态。
pub fn apply_catalog_delta(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
  classified: &[(AssetRow, CatalogDeltaKind)],
  queue_downloads: bool,
) -> Result<CatalogApplySummary, String> {
  let now = chrono::Utc::now().timestamp();
  let mut summary = CatalogApplySummary::default();
  let mut unchanged_touch: Vec<(String, String)> = Vec::new();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启事务失败: {e}"))?;

  let (dl_status, dl_job): (Option<&str>, Option<i64>) = if queue_downloads {
    (Some(AssetStatus::Pending.as_str()), Some(job_id))
  } else {
    (None, None)
  };

  for (row, kind) in classified {
    match kind {
      CatalogDeltaKind::Added => {
        summary.added += 1;
        if queue_downloads {
          summary.enqueued += 1;
        }
        tx.execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind, live_pair_id,
            part, download_status, active_job_id, cloud_state, last_catalog_at,
            cpl_asset_record_name, cpl_asset_change_tag,
            capture_at, added_at, latitude, longitude
          ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
          ON CONFLICT(apple_id, asset_id, part) DO UPDATE SET
            sort_key = excluded.sort_key,
            original_filename = excluded.original_filename,
            media_kind = excluded.media_kind,
            live_pair_id = excluded.live_pair_id,
            download_status = excluded.download_status,
            active_job_id = excluded.active_job_id,
            cloud_state = 'cloud_only',
            last_catalog_at = excluded.last_catalog_at,
            cpl_asset_record_name = COALESCE(excluded.cpl_asset_record_name, assets.cpl_asset_record_name),
            cpl_asset_change_tag = COALESCE(excluded.cpl_asset_change_tag, assets.cpl_asset_change_tag),
            capture_at = excluded.capture_at,
            added_at = excluded.added_at,
            latitude = excluded.latitude,
            longitude = excluded.longitude
          "#,
          params![
            apple_id,
            row.asset_id,
            row.sort_key,
            row.original_filename,
            row.media_kind.as_str(),
            row.live_pair_id,
            row.part.as_str(),
            dl_status,
            dl_job,
            CloudState::CloudOnly.as_str(),
            now,
            row.cpl_asset_record_name,
            row.cpl_asset_change_tag,
            row.capture_at,
            row.added_at,
            row.latitude,
            row.longitude,
          ],
        )
        .map_err(|e| format!("写入 added asset 失败: {e}"))?;
      }
      CatalogDeltaKind::Modified => {
        summary.modified += 1;
        if queue_downloads {
          summary.enqueued += 1;
        }
        tx.execute(
          r#"
          UPDATE assets SET
            sort_key = ?1,
            original_filename = ?2,
            media_kind = ?3,
            live_pair_id = ?4,
            last_catalog_at = ?5,
            download_status = ?6,
            active_job_id = ?7,
            cloud_state = 'cloud_only',
            cpl_asset_record_name = COALESCE(?8, cpl_asset_record_name),
            cpl_asset_change_tag = COALESCE(?9, cpl_asset_change_tag),
            capture_at = ?10,
            added_at = ?11,
            latitude = ?12,
            longitude = ?13
          WHERE apple_id = ?14 AND asset_id = ?15 AND part = ?16
          "#,
          params![
            row.sort_key,
            row.original_filename,
            row.media_kind.as_str(),
            row.live_pair_id,
            now,
            dl_status,
            dl_job,
            row.cpl_asset_record_name,
            row.cpl_asset_change_tag,
            row.capture_at,
            row.added_at,
            row.latitude,
            row.longitude,
            apple_id,
            row.asset_id,
            row.part.as_str(),
          ],
        )
        .map_err(|e| format!("写入 modified→cloud_only asset 失败: {e}"))?;
      }
      CatalogDeltaKind::MetadataRefresh => {
        summary.metadata_refresh += 1;
        tx.execute(
          r#"
          UPDATE assets SET
            last_catalog_at = ?1,
            cpl_asset_record_name = COALESCE(?2, cpl_asset_record_name),
            capture_at = ?3,
            added_at = ?4,
            latitude = ?5,
            longitude = ?6
          WHERE apple_id = ?7 AND asset_id = ?8 AND part = ?9
          "#,
          params![
            now,
            row.cpl_asset_record_name,
            row.capture_at,
            row.added_at,
            row.latitude,
            row.longitude,
            apple_id,
            row.asset_id,
            row.part.as_str(),
          ],
        )
        .map_err(|e| format!("刷新 metadata asset 失败: {e}"))?;
      }
      CatalogDeltaKind::Unchanged => {
        summary.unchanged += 1;
        summary.unchanged_skipped += 1;
        unchanged_touch.push((row.asset_id.clone(), row.part.as_str().to_string()));
      }
    }
  }

  tx.commit().map_err(|e| format!("提交 catalog delta 失败: {e}"))?;
  batch_touch_last_catalog_at(conn, apple_id, now, &unchanged_touch)?;
  Ok(summary)
}

/// catalog 后补入队：`cloud_only` 且仍在本次 catalog keys 内的孤儿行（需先 `prepare_catalog_keys_temp`）
pub fn enqueue_outstanding_for_full_sync(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
) -> Result<u32, String> {
  let changed = conn
    .execute(
      &format!(
        r#"
        UPDATE assets SET download_status = 'pending', active_job_id = ?1
        WHERE apple_id = ?2
          AND cloud_state = 'cloud_only'
          AND (
            active_job_id IS NULL
            OR active_job_id != ?1
            OR download_status IS NULL
            OR download_status != 'pending'
          )
          AND EXISTS (
            SELECT 1 FROM {CATALOG_KEYS_TEMP} t
            WHERE t.asset_id = assets.asset_id AND t.part = assets.part
          )
        "#
      ),
      params![job_id, apple_id],
    )
    .map_err(|e| format!("full 同步补入队失败: {e}"))?;
  Ok(u32::try_from(changed).unwrap_or(0))
}

/// 「开始同步」入队：将当前账号全部 `cloud_only` 绑到 sync job（不依赖 catalog temp；须先刷新落库）
pub fn enqueue_cloud_only_for_sync(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
) -> Result<u32, String> {
  let changed = conn
    .execute(
      r#"
      UPDATE assets SET download_status = 'pending', active_job_id = ?1
      WHERE apple_id = ?2
        AND cloud_state = 'cloud_only'
        AND (
          active_job_id IS NULL
          OR active_job_id != ?1
          OR download_status IS NULL
          OR download_status != 'pending'
        )
      "#,
      params![job_id, apple_id],
    )
    .map_err(|e| format!("cloud_only 入队失败: {e}"))?;
  Ok(u32::try_from(changed).unwrap_or(0))
}

/// catalog 中消失的 (asset_id, part) → deleted_cloud_pending（需先 `prepare_catalog_keys_temp`）
pub fn mark_catalog_deletions(conn: &Connection, apple_id: &str) -> Result<u32, String> {
  let now = chrono::Utc::now().timestamp();
  let changed = conn
    .execute(
      &format!(
        r#"
        UPDATE assets SET cloud_state = 'deleted_cloud_pending', last_catalog_at = ?1
        WHERE apple_id = ?2
          AND cloud_state NOT IN ('deleted_cloud_pending', 'cloud_delete_queued', 'failed_delete')
          AND NOT EXISTS (
            SELECT 1 FROM {CATALOG_KEYS_TEMP} t
            WHERE t.asset_id = assets.asset_id AND t.part = assets.part
          )
        "#
      ),
      params![now, apple_id],
    )
    .map_err(|e| format!("批量标记 deleted_cloud_pending 失败: {e}"))?;
  Ok(u32::try_from(changed).unwrap_or(0))
}

/// @deprecated 首版 catalog 全量入队；P2 起用 apply_catalog_delta；仅测试沿用
#[cfg(test)]
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
        part, download_status, active_job_id, cloud_state, last_catalog_at,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      ON CONFLICT(apple_id, asset_id, part) DO UPDATE SET
        sort_key = excluded.sort_key,
        original_filename = excluded.original_filename,
        media_kind = excluded.media_kind,
        live_pair_id = excluded.live_pair_id,
        download_status = 'pending',
        active_job_id = excluded.active_job_id,
        last_catalog_at = excluded.last_catalog_at,
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

/// catalog 结束：写入 job 快照 total/pending（按逻辑资产，Live still+mov=1）
pub fn set_job_catalog_counts(conn: &Connection, job_id: i64) -> Result<(), String> {
  let (done, failed, pending) = count_assets_by_status(conn, job_id)?;
  let total = done + failed + pending;
  conn
    .execute(
      r#"
      UPDATE jobs SET
        total_count = ?1, pending_count = ?2, done_count = ?3, failed_count = ?4
      WHERE id = ?5
      "#,
      params![
        i32::try_from(total).unwrap_or(i32::MAX),
        i32::try_from(pending).unwrap_or(i32::MAX),
        i32::try_from(done).unwrap_or(i32::MAX),
        i32::try_from(failed).unwrap_or(i32::MAX),
        job_id
      ],
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
      SELECT id, COALESCE(task_type, 'sync'), view, output_dir, apple_id, status,
             created_at, finished_at,
             COALESCE(total_count, 0), COALESCE(done_count, 0),
             COALESCE(failed_count, 0), COALESCE(pending_count, 0)
      FROM jobs WHERE id = ?1
      "#,
      params![job_id],
      map_job_row,
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

/// 列出失败资产（按 sort_key 升序，供同步页表格）
pub fn list_failed_assets(
  conn: &Connection,
  job_id: i64,
  limit: u32,
) -> Result<Vec<IcloudSyncFailedAssetRow>, String> {
  let lim = i64::from(limit.max(1));
  let mut stmt = conn
    .prepare(
      r#"
      SELECT part, original_filename, last_error, attempt_count
      FROM assets
      WHERE active_job_id = ?1 AND download_status = ?2
      ORDER BY sort_key ASC,
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
          part: row.get(0)?,
          original_filename: row.get(1)?,
          last_error: row
            .get::<_, Option<String>>(2)?
            .unwrap_or_else(|| "download_failed".to_string()),
          attempt_count: row.get(3)?,
        })
      },
    )
    .map_err(|e| format!("查询 failed 资产失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析 failed 资产失败: {e}"))?;
  Ok(rows)
}

/// 删除同步任务行；释放其 download 绑定，不删 assets 注册表
pub fn discard_sync_job(conn: &Connection, job_id: i64) -> Result<(), String> {
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

/// 取消未完成的删云任务：撤销队列并删除 job
pub fn discard_cloud_delete_job(conn: &Connection, job_id: i64) -> Result<(), String> {
  let keys: Vec<(String, String)> = conn
    .prepare(
      r#"
      SELECT asset_id, part FROM cloud_delete_queue
      WHERE job_id = ?1 AND status IN ('pending', 'deleting')
      "#,
    )
    .map_err(|e| format!("准备删云任务撤销查询失败: {e}"))?
    .query_map(params![job_id], |row| Ok((row.get(0)?, row.get(1)?)))
    .map_err(|e| format!("查询删云任务队列失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析删云任务队列失败: {e}"))?;

  if !keys.is_empty() {
    let apple_id: String = conn
      .query_row("SELECT apple_id FROM jobs WHERE id = ?1", params![job_id], |r| r.get(0))
      .map_err(|e| format!("读取删云任务 apple_id 失败: {e}"))?;
    cancel_cloud_deletes(conn, &apple_id, &keys)?;
  }

  conn
    .execute("DELETE FROM cloud_delete_queue WHERE job_id = ?1", params![job_id])
    .map_err(|e| format!("删除删云队列失败: {e}"))?;
  conn
    .execute("DELETE FROM jobs WHERE id = ?1", params![job_id])
    .map_err(|e| format!("删除删云 job 失败: {e}"))?;
  Ok(())
}

/// 按任务类型取消未完成任务
pub fn discard_task(conn: &Connection, job: &JobRow) -> Result<(), String> {
  match job.task_type {
    TaskType::Sync | TaskType::Catalog => discard_sync_job(conn, job.id),
    TaskType::CloudDelete => discard_cloud_delete_job(conn, job.id),
  }
}

/// 分页列出任务下全部/指定状态的文件行（按 sort_key 升序）；可选文件名 keyword 子串匹配
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
  let order = "ORDER BY sort_key ASC, CASE part WHEN 'still' THEN 0 WHEN 'mov' THEN 1 ELSE 2 END ASC";

  let count_sql = format!("SELECT COUNT(*) FROM assets WHERE {where_clause}");
  let list_sql = format!(
    r#"
    SELECT part, original_filename, download_status, last_error, attempt_count
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
    part: row.get(0)?,
    original_filename: row.get(1)?,
    status: row.get(2)?,
    last_error: row.get(3)?,
    attempt_count: row.get(4)?,
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

/// 同一逻辑资产（asset_id）多 part 时的展示态：有 pending 优先，否则 failed，否则 done
fn fold_download_statuses(statuses: &[AssetStatus]) -> AssetStatus {
  if statuses.iter().any(|s| *s == AssetStatus::Pending) {
    AssetStatus::Pending
  } else if statuses.iter().any(|s| *s == AssetStatus::Failed) {
    AssetStatus::Failed
  } else {
    AssetStatus::Done
  }
}

/// 按状态统计**逻辑资产**数量：(done, failed, pending)
/// Live still+mov 同 asset_id 计 1；下载循环仍按 part 行处理。
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
      "SELECT asset_id, download_status FROM assets WHERE active_job_id = ?1 AND download_status IS NOT NULL",
    )
    .map_err(|e| format!("准备统计查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![job_id], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|e| format!("统计 assets 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析统计行失败: {e}"))?;

  let mut by_asset: std::collections::HashMap<String, Vec<AssetStatus>> =
    std::collections::HashMap::new();
  for (asset_id, status) in rows {
    let Some(st) = AssetStatus::parse(&status) else {
      continue;
    };
    by_asset.entry(asset_id).or_default().push(st);
  }

  let mut done = 0u32;
  let mut failed = 0u32;
  let mut pending = 0u32;
  for statuses in by_asset.values() {
    match fold_download_statuses(statuses) {
      AssetStatus::Done => done = done.saturating_add(1),
      AssetStatus::Failed => failed = failed.saturating_add(1),
      AssetStatus::Pending => pending = pending.saturating_add(1),
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
           live_pair_id, part, download_status, active_job_id, dest_path,
           cloud_state, last_synced_at, last_catalog_at, last_error, attempt_count,
           cpl_asset_record_name, cpl_asset_change_tag,
           capture_at, added_at, latitude, longitude
    FROM assets
    WHERE active_job_id = ?1 AND download_status IN ({placeholders})
    ORDER BY sort_key ASC,
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
  let part_s: String = row.get(7)?;
  let download_s: Option<String> = row.get(8)?;
  let cloud_s: String = row.get(11)?;
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
    part: AssetPart::parse(&part_s).ok_or_else(|| {
      rusqlite::Error::InvalidColumnType(7, "part".into(), rusqlite::types::Type::Text)
    })?,
    download_status: download_s.and_then(|s| AssetStatus::parse(&s)),
    active_job_id: row.get(9)?,
    dest_path: row.get(10)?,
    cloud_state: CloudState::parse(&cloud_s).unwrap_or(CloudState::CloudOnly),
    last_synced_at: row.get(12)?,
    last_catalog_at: row.get(13)?,
    last_error: row.get(14)?,
    attempt_count: row.get(15)?,
    cpl_asset_record_name: row.get(16)?,
    cpl_asset_change_tag: row.get(17)?,
    capture_at: row.get(18)?,
    added_at: row.get(19)?,
    latitude: row.get(20)?,
    longitude: row.get(21)?,
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

/// 入队删云结果（UI 按逻辑资产计；rejected = missing_cpl + local_missing + 其它跳过）
#[derive(Debug, Clone, Default)]
pub struct EnqueueCloudDeleteResult {
  /// 至少有一个 part 入队成功的逻辑资产数（Live=1）
  pub accepted: u32,
  /// 无任何 part 入队成功的逻辑资产数
  pub rejected: u32,
  /// 缺 catalog 落库的 CPL 元数据（按逻辑资产）
  pub rejected_missing_cpl: u32,
  /// dest_path 空或磁盘无文件（按逻辑资产）
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

/// 单条 sidecar 删云失败累计上限：达到后进入 failed_delete（1 次正式 + 2 次自动重试）
const MAX_CLOUD_DELETE_ATTEMPTS: u32 = 3;

/// 启动时：中断的 deleting 行退回 pending
/// @note 不 ++attempts：进程被杀/重启不应吞掉正式重试额度
pub fn reset_interrupted_cloud_deletes(conn: &Connection) -> Result<u32, String> {
  let now = chrono::Utc::now().timestamp();
  let changed = conn
    .execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'pending', updated_at = ?1
      WHERE status = 'deleting'
      "#,
      params![now],
    )
    .map_err(|e| format!("重置中断云删队列失败: {e}"))?;
  u32::try_from(changed).map_err(|_| "重置行数超出 u32".to_string())
}

/// 全局待下载数：仅统计**未完成** sync job 占用的 pending 行（测试用）
#[cfg(test)]
pub fn count_global_pending_downloads(conn: &Connection) -> Result<u32, String> {
  let n: i64 = conn
    .query_row(
      r#"
      SELECT COUNT(*) FROM assets a
      INNER JOIN jobs j ON j.id = a.active_job_id
      WHERE a.download_status = ?1
        AND j.status IN ('cataloging', 'pending', 'running', 'paused_session', 'paused_user')
      "#,
      params![AssetStatus::Pending.as_str()],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计 pending 下载失败: {e}"))?;
  Ok(u32::try_from(n).unwrap_or(u32::MAX))
}

/// 删云 queue 同行逻辑资产的展示态：有 pending/deleting 优先，否则 failed，否则 done
fn fold_cloud_delete_queue_statuses(statuses: &[&str]) -> &'static str {
  if statuses
    .iter()
    .any(|s| *s == "pending" || *s == "deleting")
  {
    "pending"
  } else if statuses.iter().any(|s| *s == "failed") {
    "failed"
  } else {
    "done"
  }
}

/// 云删任务进度（按 job_id 统计 queue；Live still+mov 同 asset_id 计 1）
pub fn refresh_cloud_delete_job_counts(conn: &Connection, job_id: i64) -> Result<(), String> {
  let mut stmt = conn
    .prepare("SELECT asset_id, status FROM cloud_delete_queue WHERE job_id = ?1")
    .map_err(|e| format!("准备删云任务统计失败: {e}"))?;
  let rows = stmt
    .query_map(params![job_id], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|e| format!("查询删云任务统计失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析删云任务统计失败: {e}"))?;

  let mut by_asset: std::collections::HashMap<String, Vec<String>> =
    std::collections::HashMap::new();
  for (asset_id, status) in rows {
    by_asset.entry(asset_id).or_default().push(status);
  }

  let mut done = 0u32;
  let mut failed = 0u32;
  let mut pending = 0u32;
  for statuses in by_asset.values() {
    let refs: Vec<&str> = statuses.iter().map(String::as_str).collect();
    match fold_cloud_delete_queue_statuses(&refs) {
      "done" => done = done.saturating_add(1),
      "failed" => failed = failed.saturating_add(1),
      _ => pending = pending.saturating_add(1),
    }
  }
  let total = done.saturating_add(failed).saturating_add(pending);
  let stored_total: i32 = conn
    .query_row(
      "SELECT COALESCE(total_count, 0) FROM jobs WHERE id = ?1",
      params![job_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("读取删云任务 total 失败: {e}"))?;
  let total_count = (stored_total as u32).max(total);
  conn
    .execute(
      r#"
      UPDATE jobs
      SET total_count = ?1,
          done_count = ?2,
          failed_count = ?3,
          pending_count = ?4
      WHERE id = ?5
      "#,
      params![
        i32::try_from(total_count).unwrap_or(i32::MAX),
        i32::try_from(done).unwrap_or(i32::MAX),
        i32::try_from(failed).unwrap_or(i32::MAX),
        i32::try_from(pending).unwrap_or(i32::MAX),
        job_id
      ],
    )
    .map_err(|e| format!("更新删云任务计数失败: {e}"))?;
  Ok(())
}

/// 删云任务 queue 是否还有待处理项
pub fn cloud_delete_job_has_work(conn: &Connection, job_id: i64) -> Result<bool, String> {
  let n: i64 = conn
    .query_row(
      r#"
      SELECT COUNT(*) FROM cloud_delete_queue
      WHERE job_id = ?1 AND status IN ('pending', 'deleting')
      "#,
      params![job_id],
      |row| row.get(0),
    )
    .map_err(|e| format!("统计删云待处理失败: {e}"))?;
  Ok(n > 0)
}

/// sidecar 整批 delete_assets 失败：deleting 行退回 pending，避免永久卡死
pub fn revert_cloud_deletes_batch(
  conn: &Connection,
  ids: &[i64],
  error_summary: &str,
) -> Result<(), String> {
  if ids.is_empty() {
    return Ok(());
  }
  let now = chrono::Utc::now().timestamp();
  let tx = conn
    .unchecked_transaction()
    .map_err(|e| format!("开启云删回退事务失败: {e}"))?;
  for id in ids {
    tx.execute(
      r#"
      UPDATE cloud_delete_queue
      SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2
      WHERE id = ?3 AND status = 'deleting'
      "#,
      params![error_summary, now, id],
    )
    .map_err(|e| format!("云删 queue 回退 pending 失败: {e}"))?;
  }
  tx.commit()
    .map_err(|e| format!("提交云删回退事务失败: {e}"))?;
  Ok(())
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

/// 用户发起删云：INSERT queue + cloud_state=cloud_delete_queued（须绑定 job_id）
/// 返回计数按逻辑资产（Live still+mov 计 1）；queue 仍按 part 入队。
pub fn enqueue_cloud_deletes(
  conn: &Connection,
  job_id: i64,
  apple_id: &str,
  keys: &[(String, String)],
  reason: &str,
) -> Result<EnqueueCloudDeleteResult, String> {
  let now = chrono::Utc::now().timestamp();
  #[derive(Clone, Copy)]
  enum PartOutcome {
    Accepted,
    RejectedMissingCpl,
    RejectedLocalMissing,
    RejectedOther,
  }
  let mut outcomes: std::collections::HashMap<String, Vec<PartOutcome>> =
    std::collections::HashMap::new();
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
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::RejectedOther);
      continue;
    };
    // 无 CPLAsset 元数据无法定点删云（需重新 catalog）；禁止扫库补齐
    if cpl_name.as_deref().map(str::trim).unwrap_or("").is_empty() {
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::RejectedMissingCpl);
      continue;
    }
    if cloud_state == CloudState::CloudDeleteQueued.as_str() {
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::Accepted);
      continue;
    }
    // 腾空间：本地文件必须在盘；避免「云删了、本地也没了」
    if !local_file_ready_for_cloud_delete(dest_path.as_deref()) {
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::RejectedLocalMissing);
      continue;
    }

    let inserted = tx
      .execute(
        r#"
        INSERT OR IGNORE INTO cloud_delete_queue(
          job_id, apple_id, asset_id, part, reason, prev_cloud_state, local_path,
          status, attempts, created_at, updated_at,
          cpl_asset_record_name, cpl_asset_change_tag
        ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', 0, ?8, ?8, ?9, ?10)
        "#,
        params![
          job_id,
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
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::Accepted);
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
      outcomes
        .entry(asset_id.clone())
        .or_default()
        .push(PartOutcome::Accepted);
    }
  }

  tx.commit().map_err(|e| format!("提交云删入队事务失败: {e}"))?;

  let mut result = EnqueueCloudDeleteResult::default();
  for part_outcomes in outcomes.values() {
    if part_outcomes
      .iter()
      .any(|o| matches!(o, PartOutcome::Accepted))
    {
      result.accepted = result.accepted.saturating_add(1);
      continue;
    }
    result.rejected = result.rejected.saturating_add(1);
    if part_outcomes
      .iter()
      .any(|o| matches!(o, PartOutcome::RejectedMissingCpl))
    {
      result.rejected_missing_cpl = result.rejected_missing_cpl.saturating_add(1);
    } else if part_outcomes
      .iter()
      .any(|o| matches!(o, PartOutcome::RejectedLocalMissing))
    {
      result.rejected_local_missing = result.rejected_local_missing.saturating_add(1);
    }
  }
  Ok(result)
}

/// 撤销 pending 云删：删 queue 行并恢复 prev_cloud_state
/// @returns 取消成功的逻辑资产数（Live still+mov 计 1）
pub fn cancel_cloud_deletes(
  conn: &Connection,
  apple_id: &str,
  keys: &[(String, String)],
) -> Result<u32, String> {
  let mut cancelled_assets = std::collections::HashSet::new();
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
    cancelled_assets.insert(asset_id.clone());
  }

  tx.commit().map_err(|e| format!("提交取消云删事务失败: {e}"))?;
  Ok(u32::try_from(cancelled_assets.len()).unwrap_or(u32::MAX))
}

/// 将 failed_delete 资产重新入队
/// @returns 重新入队的逻辑资产数（Live still+mov 计 1）
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

  let mut retried_assets = std::collections::HashSet::new();
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
    retried_assets.insert(asset_id);
  }
  Ok(u32::try_from(retried_assets.len()).unwrap_or(u32::MAX))
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

/// 刷新 catalog 时：已同步但本地文件缺失的行降级为 cloud_only（待同步）
/// @returns 降级行数
/// @note 生产路径走 `…_in_catalog`；本全量版供 cloud_assets 单测复用
#[allow(dead_code)]
pub fn reconcile_synced_missing_local_files(
  conn: &Connection,
  apple_id: &str,
) -> Result<u32, String> {
  reconcile_synced_missing_local_files_scoped(conn, apple_id, false)
}

/// 仅检查本次 catalog 仍存在的 synced 行（需先 `prepare_catalog_keys_temp`）
pub fn reconcile_synced_missing_local_files_in_catalog(
  conn: &Connection,
  apple_id: &str,
) -> Result<u32, String> {
  reconcile_synced_missing_local_files_scoped(conn, apple_id, true)
}

fn reconcile_synced_missing_local_files_scoped(
  conn: &Connection,
  apple_id: &str,
  catalog_only: bool,
) -> Result<u32, String> {
  let catalog_filter = if catalog_only {
    format!(
      "AND EXISTS (
        SELECT 1 FROM {CATALOG_KEYS_TEMP} t
        WHERE t.asset_id = assets.asset_id AND t.part = assets.part
      )"
    )
  } else {
    String::new()
  };
  let sql = format!(
    r#"
    SELECT asset_id, part, dest_path FROM assets
    WHERE apple_id = ?1 AND cloud_state = ?2
      AND dest_path IS NOT NULL AND trim(dest_path) != ''
      {catalog_filter}
    "#
  );
  let mut stmt = conn
    .prepare(&sql)
    .map_err(|e| format!("准备本地缺失 reconcile 失败: {e}"))?;
  let rows = stmt
    .query_map(params![apple_id, CloudState::Synced.as_str()], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, String>(2)?,
      ))
    })
    .map_err(|e| format!("查询本地缺失 reconcile 失败: {e}"))?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| format!("解析本地缺失 reconcile 失败: {e}"))?;

  let mut changed = 0u32;
  for (asset_id, part, dest_path) in rows {
    if Path::new(dest_path.trim()).is_file() {
      continue;
    }
    if clear_local_binding(conn, apple_id, &asset_id, &part)? {
      changed += 1;
    }
  }
  Ok(changed)
}

/// 取指定删云任务的 pending 批次
pub fn list_pending_cloud_deletes(
  conn: &Connection,
  job_id: i64,
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
      WHERE q.job_id = ?1 AND q.status = 'pending'
      ORDER BY q.created_at ASC
      LIMIT ?2
      "#,
    )
    .map_err(|e| format!("准备 pending 云删查询失败: {e}"))?;
  let rows = stmt
    .query_map(params![job_id, lim], |row| {
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

/// 云删 API 成功：标记 deleted_cloud_pending，保留注册表行供用户在云列表查看
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
    r#"
    UPDATE assets SET
      cloud_state = ?1,
      download_status = NULL,
      active_job_id = NULL,
      last_catalog_at = ?2
    WHERE apple_id = ?3 AND asset_id = ?4 AND part = ?5
    "#,
    params![
      CloudState::DeletedCloudPending.as_str(),
      now,
      apple_id,
      asset_id,
      part,
    ],
  )
  .map_err(|e| format!("标记 deleted_cloud_pending 失败: {e}"))?;
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

/// 云删 API 失败：attempts++，≥ MAX_CLOUD_DELETE_ATTEMPTS 则 failed_delete
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

  fn test_cloud_delete_job(conn: &Connection) -> i64 {
    insert_job(
      conn,
      TaskType::CloudDelete,
      JobView::Library,
      "",
      "user@icloud.com",
      JobStatus::Running,
      1,
    )
    .expect("cloud delete job")
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
        part, download_status, cloud_state, dest_path,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES('user@icloud.com', 'A1', '2024', 'a.jpg', 'photo', 'full', NULL, 'synced', ?1,
               'CPL-A1', 'tag1')
      "#,
      params![dest],
    )
    .expect("insert asset");

    let job_id = test_cloud_delete_job(&conn);
    let summary = enqueue_cloud_deletes(
      &conn,
      job_id,
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
        part, download_status, cloud_state, dest_path,
        cpl_asset_record_name, cpl_asset_change_tag
      ) VALUES('user@icloud.com', 'A2', '2024', 'b.jpg', 'photo', 'full', 'done', 'synced', ?1,
               'CPL-A2', 'tag2')
      "#,
      params![gone.to_string_lossy().to_string()],
    )
    .expect("insert");

    let job_id = test_cloud_delete_job(&conn);
    let summary = enqueue_cloud_deletes(
      &conn,
      job_id,
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
  fn enqueue_live_pair_counts_as_one_accepted() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let dir = std::env::temp_dir().join(format!(
      "icloud-enqueue-live-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let still = dir.join("a.heic");
    let mov = dir.join("a.mov");
    std::fs::write(&still, b"s").unwrap();
    std::fs::write(&mov, b"m").unwrap();
    for (part, dest, name) in [
      ("still", still.to_str().unwrap(), "a.HEIC"),
      ("mov", mov.to_str().unwrap(), "a.MOV"),
    ] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            part, download_status, cloud_state, dest_path,
            cpl_asset_record_name, cpl_asset_change_tag
          ) VALUES('user@icloud.com', 'L1', '2024', ?1, 'live', ?2, NULL, 'synced', ?3,
                   ?4, 'tag')
          "#,
          params![name, part, dest, format!("CPL-L1-{part}")],
        )
        .expect("insert live part");
    }

    let job_id = test_cloud_delete_job(&conn);
    let summary = enqueue_cloud_deletes(
      &conn,
      job_id,
      "user@icloud.com",
      &[
        ("L1".into(), "still".into()),
        ("L1".into(), "mov".into()),
      ],
      "test",
    )
    .expect("enqueue");
    assert_eq!(summary.accepted, 1, "UI logical count");
    let queued: i64 = conn
      .query_row("SELECT COUNT(*) FROM cloud_delete_queue", [], |r| r.get(0))
      .expect("q");
    assert_eq!(queued, 2, "queue still has two parts");

    refresh_cloud_delete_job_counts(&conn, job_id).expect("counts");
    let (done, failed, pending, total) = {
      let job = get_job(&conn, job_id).unwrap().unwrap();
      (
        job.done_count,
        job.failed_count,
        job.pending_count,
        job.total_count,
      )
    };
    assert_eq!((done, failed, pending), (0, 0, 1));
    assert!(total >= 1);

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn count_assets_by_status_folds_live_parts() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      "/tmp/out",
      "user@icloud.com",
      JobStatus::Running,
      1,
    )
    .expect("job");
    for (part, status) in [("still", "done"), ("mov", "pending")] {
      conn
        .execute(
          r#"
          INSERT INTO assets(
            apple_id, asset_id, sort_key, original_filename, media_kind,
            part, download_status, active_job_id, cloud_state
          ) VALUES('user@icloud.com', 'L1', '2024', 'a.HEIC', 'live', ?1, ?2, ?3, 'cloud_only')
          "#,
          params![part, status, job_id],
        )
        .expect("insert");
    }
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, active_job_id, cloud_state
        ) VALUES('user@icloud.com', 'P1', '2024', 'b.jpg', 'photo', 'full', 'done', ?1, 'synced')
        "#,
        params![job_id],
      )
      .expect("photo");

    let (done, failed, pending) = count_assets_by_status(&conn, job_id).expect("count");
    assert_eq!(done, 1);
    assert_eq!(failed, 0);
    assert_eq!(pending, 1, "live still done + mov pending → one pending");

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
            part, download_status, cloud_state, dest_path,
            cpl_asset_record_name, cpl_asset_change_tag
          ) VALUES('user@icloud.com', ?1, '2024', 'x.jpg', 'photo', 'full', 'done', ?2, ?3,
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
  fn count_global_pending_downloads_ignores_done_job_orphans() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let done_job = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Done,
      1,
    )
    .expect("job");
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, active_job_id, cloud_state
        ) VALUES('user@icloud.com', 'D1', '2024', 'd.jpg', 'photo', 'full', 'pending', ?1, 'cloud_only')
        "#,
        params![done_job],
      )
      .expect("insert orphan pending");
    assert_eq!(count_global_pending_downloads(&conn).expect("count"), 0);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn revert_cloud_deletes_batch_restores_pending_after_sidecar_failure() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let media = std::env::temp_dir().join(format!(
      "icloud-revert-del-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    std::fs::write(&media, b"ok").expect("write");
    let dest = media.to_string_lossy().to_string();
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, cloud_state, dest_path,
          cpl_asset_record_name, cpl_asset_change_tag
        ) VALUES('user@icloud.com', 'R1', '2024', 'r.jpg', 'photo', 'full', 'done', 'synced', ?1,
                 'CPL-R1', 'tag1')
        "#,
        params![dest],
      )
      .expect("insert");
    let job_id = test_cloud_delete_job(&conn);
    enqueue_cloud_deletes(&conn, job_id, "user@icloud.com", &[("R1".into(), "full".into())], "test")
      .expect("enqueue");
    let queue_id: i64 = conn
      .query_row("SELECT id FROM cloud_delete_queue LIMIT 1", [], |r| r.get(0))
      .expect("id");
    mark_cloud_deletes_deleting(&conn, &[queue_id]).expect("deleting");
    revert_cloud_deletes_batch(&conn, &[queue_id], "delete_failed: batch error").expect("revert");
    let status: String = conn
      .query_row("SELECT status FROM cloud_delete_queue WHERE id = ?1", params![queue_id], |r| r.get(0))
      .expect("status");
    assert_eq!(status, "pending");
    let _ = std::fs::remove_file(&media);
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn finalize_cloud_delete_success_keeps_asset_as_deleted_cloud_pending() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let media = std::env::temp_dir().join(format!(
      "icloud-del-success-{}.jpg",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos()
    ));
    std::fs::write(&media, b"ok").expect("write");
    let dest = media.to_string_lossy().to_string();
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, cloud_state, dest_path,
          cpl_asset_record_name, cpl_asset_change_tag
        ) VALUES('user@icloud.com', 'D1', '2024', 'd.jpg', 'photo', 'full', 'done', 'synced', ?1,
                 'CPL-D1', 'tag1')
        "#,
        params![dest],
      )
      .expect("insert");
    let job_id = test_cloud_delete_job(&conn);
    enqueue_cloud_deletes(&conn, job_id, "user@icloud.com", &[("D1".into(), "full".into())], "test")
      .expect("enqueue");
    let queue_id: i64 = conn
      .query_row("SELECT id FROM cloud_delete_queue LIMIT 1", [], |r| r.get(0))
      .expect("id");
    finalize_cloud_delete_success(&conn, queue_id, "user@icloud.com", "D1", "full").expect("success");
    let cloud_state: String = conn
      .query_row(
        "SELECT cloud_state FROM assets WHERE asset_id = 'D1'",
        [],
        |r| r.get(0),
      )
      .expect("state");
    assert_eq!(cloud_state, CloudState::DeletedCloudPending.as_str());
    let count: i64 = conn
      .query_row("SELECT COUNT(*) FROM assets WHERE asset_id = 'D1'", [], |r| r.get(0))
      .expect("count");
    assert_eq!(count, 1);
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
    assert_eq!(has_cpl, 1, "终态 assets 须含 cpl_asset_record_name");
    let has_index_num: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='index_num'",
        [],
        |r| r.get(0),
      )
      .unwrap();
    assert_eq!(has_index_num, 0, "终态无 index_num");
    let has_mode: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM pragma_table_info('jobs') WHERE name='mode'",
        [],
        |r| r.get(0),
      )
      .expect("mode col");
    assert_eq!(has_mode, 0, "终态无 jobs.mode");
    let has_cursors: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='cloud_cursors'",
        [],
        |r| r.get(0),
      )
      .expect("cursors");
    assert_eq!(has_cursors, 0, "终态无 cloud_cursors");
    let version: i32 = conn
      .query_row("PRAGMA user_version", [], |r| r.get(0))
      .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    let has_meta: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_meta'",
        [],
        |r| r.get(0),
      )
      .expect("meta");
    assert_eq!(has_meta, 0);
    let _ = std::fs::remove_file(path);
  }

  /// 终态库若仍带旧 schema_meta：吸收删表后继续可用
  #[test]
  fn ensure_schema_absorbs_schema_meta_on_v5() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("create");
    drop(conn);
    let conn = Connection::open(&path).expect("raw");
    conn
      .execute_batch(
        r#"
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        INSERT INTO schema_meta(key, value) VALUES('version', '5');
        "#,
      )
      .expect("add leftover meta");
    // user_version 已是 5，吸收只 DROP meta
    drop(conn);

    let conn = open_db(&path).expect("reopen");
    let version: i32 = conn
      .query_row("PRAGMA user_version", [], |r| r.get(0))
      .expect("ver");
    assert_eq!(version, SCHEMA_VERSION);
    let has_meta: i64 = conn
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_meta'",
        [],
        |r| r.get(0),
      )
      .expect("meta");
    assert_eq!(has_meta, 0);
    let _ = std::fs::remove_file(path);
  }

  /// 低于终态且非 0/1：报错不清空（已取消自动升级）
  #[test]
  fn ensure_schema_rejects_stale_v4_without_wipe() {
    let path = temp_db_path();
    let conn = Connection::open(&path).expect("raw");
    conn
      .execute_batch(
        r#"
        PRAGMA user_version = 4;
        CREATE TABLE jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_type TEXT NOT NULL DEFAULT 'sync',
          view TEXT NOT NULL, output_dir TEXT NOT NULL, apple_id TEXT NOT NULL,
          status TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE assets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          apple_id TEXT NOT NULL, asset_id TEXT NOT NULL, part TEXT NOT NULL,
          sort_key TEXT NOT NULL, original_filename TEXT NOT NULL, media_kind TEXT NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          cloud_state TEXT NOT NULL DEFAULT 'cloud_only',
          UNIQUE(apple_id, asset_id, part)
        );
        INSERT INTO assets(apple_id, asset_id, part, sort_key, original_filename, media_kind)
          VALUES('u@x.com', 'KEEP', 'full', '2024', 'k.jpg', 'photo');
        "#,
      )
      .expect("seed v4");
    drop(conn);

    let err = open_db(&path).expect_err("must reject");
    assert!(
      err.contains("取消自动升级") || err.contains("低于终态"),
      "unexpected err: {err}"
    );
    let conn = Connection::open(&path).expect("raw again");
    let n: i64 = conn
      .query_row("SELECT COUNT(*) FROM assets", [], |r| r.get(0))
      .expect("count");
    assert_eq!(n, 1, "拒绝升级时不得 wipe");
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
    let version: i32 = conn
      .query_row("PRAGMA user_version", [], |r| r.get(0))
      .expect("ver");
    assert_eq!(version, SCHEMA_VERSION);
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
  fn live_parts_share_pending_queue() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      TaskType::Sync,
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
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
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
        capture_at: None,
        added_at: None,
        latitude: None,
        longitude: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.HEIC".into(),
        media_kind: MediaKind::Live,
        live_pair_id: Some("L1".into()),
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
        capture_at: None,
        added_at: None,
        latitude: None,
        longitude: None,
      },
    ];
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", &assets).expect("insert");

    let pending = list_pending_assets(&conn, job_id).expect("pending");
    assert_eq!(pending.len(), 2);
    assert!(pending.iter().all(|a| a.download_status == Some(AssetStatus::Pending)));
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
      TaskType::Sync,
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
        apple_id: String::new(),
        asset_id: "A1".into(),
        sort_key: "2024-01-01T12:00:00Z".into(),
        original_filename: "IMG_1.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
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
        capture_at: None,
        added_at: None,
        latitude: None,
        longitude: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A2".into(),
        sort_key: "2024-01-02T12:00:00Z".into(),
        original_filename: "IMG_2.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
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
        capture_at: None,
        added_at: None,
        latitude: None,
        longitude: None,
      },
      AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: "A3".into(),
        sort_key: "2024-01-03T12:00:00Z".into(),
        original_filename: "IMG_3.JPG".into(),
        media_kind: MediaKind::Photo,
        live_pair_id: None,
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
        capture_at: None,
        added_at: None,
        latitude: None,
        longitude: None,
      },
    ];
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", &assets).expect("insert");

    let first = list_pending_assets(&conn, job_id).expect("pending")[0].clone();
    mark_asset_status(&conn, first.id, AssetStatus::Failed, None).expect("fail first");

    let pending = list_pending_assets(&conn, job_id).expect("pending after fail");
    assert_eq!(pending.len(), 2);
    assert_eq!(pending[0].asset_id, "A2");
    assert_eq!(pending[1].asset_id, "A3");

    let reset = reset_failed_to_pending(&conn, job_id).expect("reset");
    assert_eq!(reset, 1);
    let requeued = list_pending_assets(&conn, job_id).expect("pending after reset");
    assert_eq!(requeued.len(), 3);
    assert_eq!(requeued[0].asset_id, "A1");

    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn full_sync_re_enqueues_orphaned_cloud_only_after_discard() {
    use std::collections::HashSet;

    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let old_job = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Running,
      1,
    )
    .expect("old job");
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, active_job_id, cloud_state
        ) VALUES('user@icloud.com', 'A1', '2024-01-01', 'a.jpg', 'photo', 'full', 'pending', ?1, 'cloud_only')
        "#,
        params![old_job],
      )
      .expect("insert orphan candidate");

    discard_sync_job(&conn, old_job).expect("discard");
    assert!(list_pending_assets(&conn, old_job).expect("old pending").is_empty());

    let new_job = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Cataloging,
      2,
    )
    .expect("new job");

    let mut keys = HashSet::new();
    keys.insert(("A1".into(), "full".into()));

    let row = AssetRow {
      id: 0,
      apple_id: "user@icloud.com".into(),
      asset_id: "A1".into(),
      sort_key: "2024-01-01".into(),
      capture_at: Some("2024-01-01".into()),
      added_at: None,
      latitude: None,
      longitude: None,
      original_filename: "a.jpg".into(),
      media_kind: MediaKind::Photo,
      live_pair_id: None,
      part: AssetPart::Full,
      download_status: None,
      active_job_id: None,
      dest_path: None,
      cloud_state: CloudState::CloudOnly,
      last_synced_at: None,
      last_catalog_at: None,
      last_error: None,
      attempt_count: 0,
      cpl_asset_record_name: None,
      cpl_asset_change_tag: None,
    };
    let classified = vec![(row, CatalogDeltaKind::Unchanged)];
    let summary = apply_catalog_delta(&conn, new_job, "user@icloud.com", &classified, true).expect("delta");
    assert_eq!(summary.enqueued, 0);
    assert_eq!(summary.unchanged, 1);
    assert_eq!(summary.unchanged_skipped, 1);

    prepare_catalog_keys_temp(&conn, &keys).expect("temp");
    let extra = enqueue_outstanding_for_full_sync(&conn, new_job, "user@icloud.com").expect("re-enqueue");
    assert_eq!(extra, 1);

    let pending = list_pending_assets(&conn, new_job).expect("new pending");
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].asset_id, "A1");
    assert_eq!(pending[0].cloud_state, CloudState::CloudOnly);

    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn full_sync_re_enqueue_skips_synced_assets() {
    use std::collections::HashSet;

    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      TaskType::Sync,
      JobView::Library,
      "C:\\out",
      "user@icloud.com",
      JobStatus::Cataloging,
      1,
    )
    .expect("job");
    conn
      .execute(
        r#"
        INSERT INTO assets(
          apple_id, asset_id, sort_key, original_filename, media_kind,
          part, download_status, active_job_id, cloud_state, dest_path
        ) VALUES('user@icloud.com', 'A1', '2024-01-01', 'a.jpg', 'photo', 'full', NULL, NULL, 'synced', 'C:\\out\\00001_a.jpg')
        "#,
        [],
      )
      .expect("insert synced");

    let mut keys = HashSet::new();
    keys.insert(("A1".into(), "full".into()));
    prepare_catalog_keys_temp(&conn, &keys).expect("temp");
    let extra = enqueue_outstanding_for_full_sync(&conn, job_id, "user@icloud.com").expect("re-enqueue");
    assert_eq!(extra, 0);
    assert!(list_pending_assets(&conn, job_id).expect("pending").is_empty());

    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn paused_session_job_status_roundtrip() {
    let path = temp_db_path();
    let conn = open_db(&path).expect("open");
    let job_id = insert_job(
      &conn,
      TaskType::Sync,
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
