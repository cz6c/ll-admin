//! iCloud 云删队列与后台 worker
//! 职责：用户删云入队、cancel/retry、sidecar delete_assets 批处理与审计
//! 适用：P3 抽屉批量删云；下载 worker 活跃时让路

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::db::{
  cancel_cloud_deletes, clear_local_binding, collect_synced_keys_for_cloud_delete,
  count_global_pending_downloads, enqueue_cloud_deletes, expand_live_delete_pair,
  finalize_cloud_delete_failure, finalize_cloud_delete_success, list_pending_cloud_deletes,
  mark_cloud_deletes_deleting, open_db, reset_interrupted_cloud_deletes,
  retry_failed_cloud_deletes, state_db_path,
  CloudDeleteQueueRow,
};
use super::ensure_sidecar_authenticated;
use super::queue::{is_download_worker_active, CLOUD_STATE_CHANGED_EVENT};
use super::settings::{load_album_root_dir, load_settings};
use super::sidecar::{session_dir, SidecarClient, SidecarError, SidecarEvent};
use super::types::error_codes;

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

/// 删云入队单项（前端 camelCase）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetItem {
  pub asset_id: String,
  pub part: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetsResult {
  pub accepted: u32,
  pub rejected: u32,
  pub rejected_missing_cpl: u32,
  pub rejected_local_missing: u32,
}

fn delete_assets_result_from(summary: crate::icloud_sync::db::EnqueueCloudDeleteResult) -> IcloudSyncDeleteAssetsResult {
  IcloudSyncDeleteAssetsResult {
    accepted: summary.accepted,
    rejected: summary.rejected,
    rejected_missing_cpl: summary.rejected_missing_cpl,
    rejected_local_missing: summary.rejected_local_missing,
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncCancelCloudDeleteResult {
  pub cancelled: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncRetryCloudDeletesResult {
  pub retried: u32,
}

struct DeleteBatchItemResult {
  ok: bool,
  code: Option<String>,
  message: Option<String>,
}

/// App 启动：重置中断 deleting + 启动后台云删 worker（单例）
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

    if is_download_worker_active() {
      continue;
    }

    let db_path = match state_db_path(&app) {
      Ok(p) => p,
      Err(e) => {
        log::warn!("icloud cloud delete db path: {e}");
        continue;
      }
    };

    let outcome = (|| -> Result<(), String> {
      if let Err(e) = ensure_sidecar_authenticated(&app, client.as_ref()) {
        if e.contains(error_codes::NEED_2FA) || e.contains(error_codes::SESSION_EXPIRED) {
          return Ok(());
        }
        return Err(e);
      }

      let settings = load_settings(&app)?;
      let apple_id = settings.apple_id.trim().to_string();
      if apple_id.is_empty() {
        return Ok(());
      }

      let conn = open_db(&db_path)?;
      if count_global_pending_downloads(&conn)? > 0 {
        return Ok(());
      }

      let batch = list_pending_cloud_deletes(&conn, &apple_id, DELETE_BATCH_SIZE)?;
      if batch.is_empty() {
        return Ok(());
      }

      let ids: Vec<i64> = batch.iter().map(|r| r.id).collect();
      mark_cloud_deletes_deleting(&conn, &ids)?;

      let session_path = session_dir(&app)?;
      let results = call_delete_assets(
        client.as_ref(),
        &app,
        &batch,
        &apple_id,
        &session_path,
      )
      .map_err(|e| e.to_string())?;

      let mut changed = false;
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
          changed = true;
        } else {
          let code = result.code.as_deref().unwrap_or(error_codes::DELETE_FAILED);
          let msg = result.message.as_deref().unwrap_or(code);
          let summary = if result.message.as_deref().is_some_and(|m| !m.is_empty()) {
            format!("{code}: {msg}")
          } else {
            code.to_string()
          };
          finalize_cloud_delete_failure(
            &conn,
            row.id,
            &apple_id,
            &row.asset_id,
            &row.part,
            &summary,
          )?;
          changed = true;
        }
      }

      if changed {
        emit_cloud_state_changed(&app);
      }

      thread::sleep(Duration::from_millis(DELETE_BATCH_GAP_MS));
      Ok(())
    })();

    if let Err(e) = outcome {
      log::warn!("icloud cloud delete worker: {e}");
    }
  }
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
    out.push(DeleteBatchItemResult {
      ok,
      code,
      message,
    });
  }
  Ok(out)
}

/// 审计落盘：`<albumRoot>/audit/cloud_deletes_YYYY-MM.log`
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

/// 用户批量删云：入队 + cloud_state=cloud_delete_queued
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
  if keys.is_empty() {
    return Err("没有可删除的云资产".to_string());
  }

  let reason_text = reason
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("user_batch");

  let summary = enqueue_cloud_deletes(&conn, &apple_id, &keys, reason_text)?;
  emit_cloud_state_changed(&app);
  Ok(delete_assets_result_from(summary))
}

/// 已同步全部入队删云（跨页；仍走本地文件门禁 + Live 成对）
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
  if synced.is_empty() {
    return Err("没有已同步的云资产可删".to_string());
  }

  let mut seen = std::collections::HashSet::new();
  let mut keys: Vec<(String, String)> = Vec::new();
  for (asset_id, part) in synced {
    for key in expand_live_delete_pair(&conn, &apple_id, &asset_id, &part)? {
      if seen.insert(key.clone()) {
        keys.push(key);
      }
    }
  }
  if keys.is_empty() {
    return Err("没有可删除的云资产".to_string());
  }

  let reason_text = reason
    .as_deref()
    .map(str::trim)
    .filter(|s| !s.is_empty())
    .unwrap_or("user_all_synced");

  let summary = enqueue_cloud_deletes(&conn, &apple_id, &keys, reason_text)?;
  emit_cloud_state_changed(&app);
  Ok(delete_assets_result_from(summary))
}

/// 撤销 pending 云删
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
  emit_cloud_state_changed(&app);
  Ok(IcloudSyncCancelCloudDeleteResult { cancelled })
}

/// 将 failed_delete 重新入队
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
  let retried = retry_failed_cloud_deletes(&conn, &apple_id)?;
  emit_cloud_state_changed(&app);
  Ok(IcloudSyncRetryCloudDeletesResult { retried })
}

/// 移除本地绑定（不删盘、不删云）
#[tauri::command]
pub fn icloud_sync_clear_local_binding(
  app: AppHandle,
  asset_id: String,
  part: String,
) -> Result<bool, String> {
  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let changed = clear_local_binding(&conn, &apple_id, asset_id.trim(), part.trim())?;
  if changed {
    emit_cloud_state_changed(&app);
  }
  Ok(changed)
}
