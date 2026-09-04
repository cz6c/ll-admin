//! iCloud 删云任务
//! 职责：删云作为 CloudDelete 类型统一任务入队、worker 批处理、与同步全局互斥
//! 适用：抽屉「释放 iCloud 空间」

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::Duration;

use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::db::{
  cancel_cloud_deletes, collect_synced_keys_for_cloud_delete,
  cloud_delete_job_has_work, discard_cloud_delete_job, enqueue_cloud_deletes,
  expand_live_delete_pair, finalize_cloud_delete_failure, finalize_cloud_delete_success,
  find_incomplete_task_for_apple, insert_job, list_pending_cloud_deletes,
  mark_cloud_deletes_deleting, open_db, refresh_cloud_delete_job_counts,
  reset_interrupted_cloud_deletes, retry_failed_cloud_deletes, revert_cloud_deletes_batch,
  state_db_path, CloudDeleteQueueRow,
};
use super::ensure_sidecar_authenticated;
use super::queue::{
  emit_task_progress, emit_task_status, is_worker_slot_active, release_job, set_task_status,
  try_claim_job, CLOUD_STATE_CHANGED_EVENT,
};
use super::settings::{load_album_root_dir, load_settings};
use super::sidecar::{session_dir, SidecarClient, SidecarError, SidecarEvent};
use super::task::require_no_incomplete_task;
use super::types::{error_codes, JobStatus, JobView, TaskType};

const DELETE_BATCH_SIZE: u32 = 50;
const WORKER_IDLE_MS: u64 = 2000;
const DELETE_BATCH_GAP_MS: u64 = 800;

static DELETE_WORKER_STARTED: OnceLock<AtomicBool> = OnceLock::new();

fn delete_worker_flag() -> &'static AtomicBool {
  DELETE_WORKER_STARTED.get_or_init(|| AtomicBool::new(false))
}

fn emit_cloud_state_changed(app: &AppHandle) {
  let _ = app.emit(CLOUD_STATE_CHANGED_EVENT, ());
}

fn is_auth_pause_message(msg: &str) -> bool {
  msg.contains(error_codes::NEED_2FA)
    || msg.contains(error_codes::SESSION_EXPIRED)
    || msg.starts_with(error_codes::AUTH_FAILED)
    || msg.starts_with(error_codes::SIDECAR_CRASHED)
    || msg.contains(error_codes::ACCOUNT_LOCKED)
}

fn is_auth_pause_code(code: &str) -> bool {
  code == error_codes::NEED_2FA
    || code == error_codes::SESSION_EXPIRED
    || code == error_codes::AUTH_FAILED
    || code == error_codes::ACCOUNT_LOCKED
    || code == error_codes::SIDECAR_CRASHED
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetItem {
  pub asset_id: String,
  pub part: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetsResult {
  /// 逻辑资产数（Live still+mov=1）
  pub accepted: u32,
  pub rejected: u32,
  pub rejected_missing_cpl: u32,
  pub rejected_local_missing: u32,
  pub job_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncCancelCloudDeleteResult {
  /// 逻辑资产数（Live=1）
  pub cancelled: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncRetryCloudDeletesResult {
  /// 逻辑资产数（Live=1）
  pub retried: u32,
  pub job_id: i64,
}

struct DeleteBatchItemResult {
  ok: bool,
  code: Option<String>,
  message: Option<String>,
}

fn delete_assets_result_from(
  job_id: i64,
  summary: super::db::EnqueueCloudDeleteResult,
) -> IcloudSyncDeleteAssetsResult {
  IcloudSyncDeleteAssetsResult {
    accepted: summary.accepted,
    rejected: summary.rejected,
    rejected_missing_cpl: summary.rejected_missing_cpl,
    rejected_local_missing: summary.rejected_local_missing,
    job_id,
  }
}

pub fn init_cloud_delete_worker(app: AppHandle, client: Arc<SidecarClient>) {
  if delete_worker_flag()
    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
    .is_err()
  {
    return;
  }

  if let Ok(db_path) = state_db_path(&app) {
    if let Ok(conn) = open_db(&db_path) {
      if let Err(e) = reset_interrupted_cloud_deletes(&conn) {
        log::warn!("icloud cloud delete reset interrupted: {e}");
      }
    }
  }

  thread::spawn(move || run_cloud_delete_worker(app, client));
}

fn run_cloud_delete_worker(app: AppHandle, client: Arc<SidecarClient>) {
  loop {
    thread::sleep(Duration::from_millis(WORKER_IDLE_MS));

    if is_worker_slot_active() {
      continue;
    }

    let settings = match load_settings(&app) {
      Ok(s) => s,
      Err(e) => {
        log::warn!("icloud cloud delete settings: {e}");
        continue;
      }
    };
    let apple_id = settings.apple_id.trim().to_string();
    if apple_id.is_empty() {
      continue;
    }

    let db_path = match state_db_path(&app) {
      Ok(p) => p,
      Err(e) => {
        log::warn!("icloud cloud delete db path: {e}");
        continue;
      }
    };

    let conn = match open_db(&db_path) {
      Ok(c) => c,
      Err(e) => {
        log::warn!("icloud cloud delete open db: {e}");
        continue;
      }
    };

    if let Err(e) = reset_interrupted_cloud_deletes(&conn) {
      log::warn!("icloud cloud delete reset interrupted: {e}");
    }

    let Some(job) = find_incomplete_task_for_apple(&conn, &apple_id)
      .ok()
      .flatten()
      .filter(|j| j.task_type == TaskType::CloudDelete)
    else {
      continue;
    };

    if matches!(job.status, JobStatus::PausedSession | JobStatus::PausedUser) {
      continue;
    }

    if try_claim_job(job.id).is_err() {
      continue;
    }

    let job_id = job.id;
    let process_result = (|| -> Result<(), String> {
      ensure_sidecar_authenticated(&app, client.as_ref()).map_err(|e| {
        if is_auth_pause_message(&e) {
          let _ = set_task_status(&app, &conn, job_id, JobStatus::PausedSession);
        }
        e
      })?;

      let batch = list_pending_cloud_deletes(&conn, job_id, DELETE_BATCH_SIZE)?;
      if batch.is_empty() {
        refresh_cloud_delete_job_counts(&conn, job_id)?;
        emit_task_status(&app, &conn, job_id);
        if !cloud_delete_job_has_work(&conn, job_id)? {
          set_task_status(&app, &conn, job_id, JobStatus::Done)?;
        }
        return Ok(());
      }

      let ids: Vec<i64> = batch.iter().map(|r| r.id).collect();
      mark_cloud_deletes_deleting(&conn, &ids)?;
      let filename = batch
        .first()
        .map(|r| r.original_filename.clone())
        .unwrap_or_default();

      refresh_cloud_delete_job_counts(&conn, job_id)?;
      emit_task_progress(&app, &conn, job_id, &filename);

      let session_path = session_dir(&app)?;
      match call_delete_assets(client.as_ref(), &app, &batch, &apple_id, &session_path) {
        Ok(results) => {
          for (row, result) in batch.iter().zip(results.iter()) {
            if result.ok {
              append_delete_audit(&app, row)?;
              finalize_cloud_delete_success(
                &conn,
                row.id,
                &apple_id,
                &row.asset_id,
                &row.part,
              )?;
            } else {
              let code = result.code.as_deref().unwrap_or(error_codes::DELETE_FAILED);
              let msg = result.message.as_deref().unwrap_or(code);
              finalize_cloud_delete_failure(
                &conn,
                row.id,
                &apple_id,
                &row.asset_id,
                &row.part,
                &format!("{code}: {msg}"),
              )?;
            }
          }
          emit_cloud_state_changed(&app);
        }
        Err(err) => {
          let summary = err.to_string();
          revert_cloud_deletes_batch(&conn, &ids, &summary)?;
          emit_cloud_state_changed(&app);
          if is_auth_pause_code(err.code.as_str()) || is_auth_pause_message(&summary) {
            set_task_status(&app, &conn, job_id, JobStatus::PausedSession)?;
          }
          return Err(summary);
        }
      }

      refresh_cloud_delete_job_counts(&conn, job_id)?;
      emit_task_progress(&app, &conn, job_id, &filename);
      if !cloud_delete_job_has_work(&conn, job_id)? {
        set_task_status(&app, &conn, job_id, JobStatus::Done)?;
      }
      thread::sleep(Duration::from_millis(DELETE_BATCH_GAP_MS));
      Ok(())
    })();

    if let Err(e) = process_result {
      log::warn!("icloud cloud delete worker job {job_id}: {e}");
    }
    release_job(job_id);
  }
}

fn start_cloud_delete_task(
  app: &AppHandle,
  apple_id: &str,
  keys: &[(String, String)],
  reason: &str,
) -> Result<IcloudSyncDeleteAssetsResult, String> {
  if keys.is_empty() {
    return Err(
      "没有可删除的云资产：本地文件缺失或缺少云端元数据。可先「刷新 iCloud 状态」后再试。"
        .to_string(),
    );
  }

  let db_path = state_db_path(app)?;
  let conn = open_db(&db_path)?;
  require_no_incomplete_task(&conn, apple_id, TaskType::CloudDelete)?;

  let created_at = chrono::Utc::now().timestamp();
  let job_id = insert_job(
    &conn,
    TaskType::CloudDelete,
    JobView::Library,
    "",
    apple_id,
    JobStatus::Running,
    created_at,
  )?;

  let summary = enqueue_cloud_deletes(&conn, job_id, apple_id, keys, reason)?;
  if summary.accepted == 0 {
    discard_cloud_delete_job(&conn, job_id)?;
    return Err(
      "没有可删除的云资产：本地文件缺失或缺少云端元数据。可先「刷新 iCloud 状态」后再试。"
        .to_string(),
    );
  }

  conn
    .execute(
      "UPDATE jobs SET total_count = ?1, pending_count = ?1 WHERE id = ?2",
      params![summary.accepted, job_id],
    )
    .map_err(|e| format!("更新删云任务 total 失败: {e}"))?;

  emit_task_status(app, &conn, job_id);
  emit_cloud_state_changed(app);
  Ok(delete_assets_result_from(job_id, summary))
}

fn call_delete_assets(
  client: &SidecarClient,
  app: &AppHandle,
  batch: &[CloudDeleteQueueRow],
  apple_id: &str,
  session_path: &PathBuf,
) -> Result<Vec<DeleteBatchItemResult>, SidecarError> {
  let items: Vec<Value> = batch
    .iter()
    .map(|row| {
      serde_json::json!({
        "asset_id": row.asset_id,
        "part": row.part,
        "cpl_asset_record_name": row.cpl_asset_record_name,
        "cpl_asset_change_tag": row.cpl_asset_change_tag,
      })
    })
    .collect();

  let event = client.request(
    app,
    serde_json::json!({
      "cmd": "delete_assets",
      "items": items,
      "apple_id": apple_id,
      "session_dir": session_path.to_string_lossy(),
    }),
  )?;

  parse_delete_assets_event(&event, batch)
}

fn parse_delete_assets_event(
  event: &SidecarEvent,
  batch: &[CloudDeleteQueueRow],
) -> Result<Vec<DeleteBatchItemResult>, SidecarError> {
  if event.event_type == "error" {
    let code = event
      .code
      .clone()
      .unwrap_or_else(|| error_codes::DELETE_FAILED.to_string());
    let message = event.message.clone().unwrap_or_default();
    return Err(SidecarError::new(code, message));
  }
  if event.event_type != "done" {
    return Err(SidecarError::new(
      error_codes::DELETE_FAILED,
      format!("delete_assets 意外响应: type={}", event.event_type),
    ));
  }

  let raw = event
    .extra
    .get("results")
    .and_then(|v| v.as_array())
    .cloned();

  let Some(raw) = raw else {
    return Ok(batch
      .iter()
      .map(|_row| DeleteBatchItemResult {
        ok: true,
        code: None,
        message: None,
      })
      .collect());
  };

  let mut out = Vec::with_capacity(batch.len());
  for (idx, _row) in batch.iter().enumerate() {
    let item = raw.get(idx);
    let (ok, code, message) = match item {
      Some(Value::Object(map)) => {
        let ok = map.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
        let code = map.get("code").and_then(|v| v.as_str()).map(str::to_string);
        let message = map
          .get("message")
          .and_then(|v| v.as_str())
          .map(str::to_string);
        (ok, code, message)
      }
      _ => (true, None, None),
    };
    out.push(DeleteBatchItemResult { ok, code, message });
  }
  Ok(out)
}

fn append_delete_audit(app: &AppHandle, row: &CloudDeleteQueueRow) -> Result<(), String> {
  let root = load_album_root_dir(app)?;
  if root.trim().is_empty() {
    return Ok(());
  }
  let audit_dir = PathBuf::from(root.trim()).join("audit");
  std::fs::create_dir_all(&audit_dir).map_err(|e| format!("创建 audit 目录失败: {e}"))?;
  let month = chrono::Utc::now().format("%Y-%m");
  let path = audit_dir.join(format!("cloud_deletes_{month}.log"));
  let line = format!(
    "{},{},{},{},{},{}\n",
    chrono::Utc::now().to_rfc3339(),
    row.asset_id,
    row.part,
    row.reason,
    row.local_path.as_deref().unwrap_or(""),
    row.original_filename,
  );
  use std::io::Write;
  let mut file = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&path)
    .map_err(|e| format!("打开 audit 日志失败: {e}"))?;
  file
    .write_all(line.as_bytes())
    .map_err(|e| format!("写入 audit 日志失败: {e}"))?;
  Ok(())
}

fn collect_delete_keys(
  conn: &rusqlite::Connection,
  apple_id: &str,
  items: &[IcloudSyncDeleteAssetItem],
) -> Result<Vec<(String, String)>, String> {
  let mut keys = Vec::new();
  let mut seen = std::collections::HashSet::new();
  for item in items {
    let asset_id = item.asset_id.trim();
    let part = item.part.trim();
    if asset_id.is_empty() || part.is_empty() {
      continue;
    }
    for key in expand_live_delete_pair(conn, apple_id, asset_id, part)? {
      if seen.insert(key.clone()) {
        keys.push(key);
      }
    }
  }
  Ok(keys)
}

#[tauri::command]
pub fn icloud_sync_delete_assets(
  app: AppHandle,
  items: Vec<IcloudSyncDeleteAssetItem>,
  reason: Option<String>,
) -> Result<IcloudSyncDeleteAssetsResult, String> {
  if items.is_empty() {
    return Err("请至少选择一项".to_string());
  }
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let keys = collect_delete_keys(&conn, &apple_id, &items)?;
  let reason_text = reason
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("user_batch");
  start_cloud_delete_task(&app, &apple_id, &keys, reason_text)
}

#[tauri::command]
pub fn icloud_sync_delete_all_synced(
  app: AppHandle,
  reason: Option<String>,
) -> Result<IcloudSyncDeleteAssetsResult, String> {
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let synced = collect_synced_keys_for_cloud_delete(&conn, &apple_id)?;
  let mut seen = std::collections::HashSet::new();
  let mut keys: Vec<(String, String)> = Vec::new();
  for (asset_id, part) in synced {
    for key in expand_live_delete_pair(&conn, &apple_id, &asset_id, &part)? {
      if seen.insert(key.clone()) {
        keys.push(key);
      }
    }
  }
  let reason_text = reason
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("user_all_synced");
  start_cloud_delete_task(&app, &apple_id, &keys, reason_text)
}

#[tauri::command]
pub fn icloud_sync_cancel_cloud_delete(
  app: AppHandle,
  items: Vec<IcloudSyncDeleteAssetItem>,
) -> Result<IcloudSyncCancelCloudDeleteResult, String> {
  if items.is_empty() {
    return Err("请至少选择一项".to_string());
  }
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let keys = collect_delete_keys(&conn, &apple_id, &items)?;
  let cancelled = cancel_cloud_deletes(&conn, &apple_id, &keys)?;

  if let Some(job) = find_incomplete_task_for_apple(&conn, &apple_id)?
    .filter(|j| j.task_type == TaskType::CloudDelete)
  {
    refresh_cloud_delete_job_counts(&conn, job.id)?;
    emit_task_status(&app, &conn, job.id);
  }

  emit_cloud_state_changed(&app);
  Ok(IcloudSyncCancelCloudDeleteResult { cancelled })
}

#[tauri::command]
pub fn icloud_sync_retry_cloud_deletes(
  app: AppHandle,
) -> Result<IcloudSyncRetryCloudDeletesResult, String> {
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  require_no_incomplete_task(&conn, &apple_id, TaskType::CloudDelete)?;

  let retried = retry_failed_cloud_deletes(&conn, &apple_id)?;
  if retried == 0 {
    return Ok(IcloudSyncRetryCloudDeletesResult {
      retried: 0,
      job_id: 0,
    });
  }

  let created_at = chrono::Utc::now().timestamp();
  let job_id = insert_job(
    &conn,
    TaskType::CloudDelete,
    JobView::Library,
    "",
    &apple_id,
    JobStatus::Running,
    created_at,
  )?;
  conn
    .execute(
      "UPDATE cloud_delete_queue SET job_id = ?1 WHERE apple_id = ?2 AND status = 'pending'",
      params![job_id, apple_id],
    )
    .map_err(|e| format!("绑定重试删云 job 失败: {e}"))?;
  conn
    .execute(
      "UPDATE jobs SET total_count = ?1, pending_count = ?1 WHERE id = ?2",
      params![retried, job_id],
    )
    .map_err(|e| format!("更新重试删云 total 失败: {e}"))?;

  emit_task_status(&app, &conn, job_id);
  emit_cloud_state_changed(&app);
  Ok(IcloudSyncRetryCloudDeletesResult { retried, job_id })
}
