//! iCloud 删云（一次性消费）
//! 职责：校验本地文件与 CPL → sidecar 分批删除 → 硬删 sync 行；不入 jobs / cloud_delete_queue
//! 适用：抽屉「释放 iCloud 空间」；与 sync/catalog 互斥（内存旗标 + require_no_incomplete_task）

use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use super::db::{
  collect_synced_keys_for_cloud_delete, expand_live_delete_pair, hard_delete_asset_part, open_db,
  resolve_cloud_delete_candidates, state_db_path,
  CloudDeleteCandidate,
};
use super::ensure_sidecar_authenticated;
use super::queue::{SidecarClientHandle, CLOUD_STATE_CHANGED_EVENT};
use super::settings::{load_album_root_dir, load_settings};
use super::sidecar::{session_dir, SidecarClient, SidecarError, SidecarEvent};
use super::task::{end_cloud_delete, require_no_incomplete_task, try_begin_cloud_delete};
use super::types::{error_codes, TaskType};

const DELETE_BATCH_SIZE: usize = 50;
const DELETE_BATCH_GAP_MS: u64 = 800;

fn emit_cloud_state_changed(app: &AppHandle) {
  let _ = app.emit(CLOUD_STATE_CHANGED_EVENT, ());
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetItem {
  pub asset_id: String,
  pub part: String,
}

/// 一次性删云结果（逻辑资产口径；Live still+mov=1）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncDeleteAssetsResult {
  /// 成功从云端移除的逻辑资产数
  pub deleted: u32,
  /// sidecar 删除失败的逻辑资产数
  pub failed: u32,
  /// 校验阶段跳过（缺 CPL / 本地缺失等）
  pub rejected: u32,
  pub rejected_missing_cpl: u32,
  pub rejected_local_missing: u32,
  pub message: String,
}

struct DeleteBatchItemResult {
  ok: bool,
  code: Option<String>,
  message: Option<String>,
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

fn call_delete_assets(
  client: &SidecarClient,
  app: &AppHandle,
  batch: &[CloudDeleteCandidate],
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
  batch: &[CloudDeleteCandidate],
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

fn append_delete_audit(app: &AppHandle, row: &CloudDeleteCandidate) -> Result<(), String> {
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

/**
 * 一次性删云主路径：校验 → sidecar 分批 → 成功硬删 assets
 * @note 不创建 CloudDelete job；与 sync 互斥靠 `try_begin_cloud_delete` + require_no_incomplete_task
 */
fn run_cloud_delete_once(
  app: &AppHandle,
  client: &SidecarClient,
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
  try_begin_cloud_delete()?;

  let result = (|| {
    let (candidates, gate) = resolve_cloud_delete_candidates(&conn, apple_id, keys, reason)?;
    if candidates.is_empty() {
      return Err(
        "没有可删除的云资产：本地文件缺失或缺少云端元数据。可先「刷新 iCloud 状态」后再试。"
          .to_string(),
      );
    }

    ensure_sidecar_authenticated(app, client)?;
    let session_path = session_dir(app)?;

    let mut deleted_parts: std::collections::HashSet<(String, String)> =
      std::collections::HashSet::new();
    let mut failed_parts: std::collections::HashSet<(String, String)> =
      std::collections::HashSet::new();
    let mut last_err = String::new();

    for chunk in candidates.chunks(DELETE_BATCH_SIZE) {
      match call_delete_assets(client, app, chunk, apple_id, &session_path) {
        Ok(results) => {
          for (row, item) in chunk.iter().zip(results.iter()) {
            if item.ok {
              let _ = append_delete_audit(app, row);
              hard_delete_asset_part(&conn, apple_id, &row.asset_id, &row.part)?;
              deleted_parts.insert((row.asset_id.clone(), row.part.clone()));
            } else {
              failed_parts.insert((row.asset_id.clone(), row.part.clone()));
              let code = item.code.as_deref().unwrap_or(error_codes::DELETE_FAILED);
              let msg = item.message.as_deref().unwrap_or(code);
              last_err = format!("{code}: {msg}");
              log::warn!(
                "icloud cloud delete item {}/{}: {last_err}",
                row.asset_id,
                row.part
              );
            }
          }
        }
        Err(err) => {
          // 整批失败：本批全部计 failed，不改 DB；后续批次继续
          last_err = err.to_string();
          log::warn!("icloud cloud delete batch: {last_err}");
          for row in chunk {
            failed_parts.insert((row.asset_id.clone(), row.part.clone()));
          }
        }
      }
      emit_cloud_state_changed(app);
      thread::sleep(Duration::from_millis(DELETE_BATCH_GAP_MS));
    }

    // 逻辑资产：任一部分成功且无失败 → deleted；否则有失败 → failed
    let mut by_asset: std::collections::HashMap<String, (bool, bool)> =
      std::collections::HashMap::new();
    for (aid, _) in &deleted_parts {
      by_asset.entry(aid.clone()).or_default().0 = true;
    }
    for (aid, _) in &failed_parts {
      by_asset.entry(aid.clone()).or_default().1 = true;
    }
    let mut deleted = 0u32;
    let mut failed = 0u32;
    for (ok, fail) in by_asset.values() {
      if *fail {
        failed = failed.saturating_add(1);
      } else if *ok {
        deleted = deleted.saturating_add(1);
      }
    }

    let message = if failed == 0 {
      format!("已从 iCloud 移除 {deleted} 项（本机文件保留）")
    } else if deleted == 0 {
      format!("移除失败：{last_err}")
    } else {
      format!("已移除 {deleted} 项，失败 {failed} 项：{last_err}")
    };

    Ok(IcloudSyncDeleteAssetsResult {
      deleted,
      failed,
      rejected: gate.rejected,
      rejected_missing_cpl: gate.rejected_missing_cpl,
      rejected_local_missing: gate.rejected_local_missing,
      message,
    })
  })();

  end_cloud_delete();
  result
}

#[tauri::command]
pub async fn icloud_sync_delete_assets(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
  items: Vec<IcloudSyncDeleteAssetItem>,
  reason: Option<String>,
) -> Result<IcloudSyncDeleteAssetsResult, String> {
  let client = sidecar.client();
  tokio::task::spawn_blocking(move || {
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
    run_cloud_delete_once(&app, client.as_ref(), &apple_id, &keys, reason_text)
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
pub async fn icloud_sync_delete_all_synced(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
  reason: Option<String>,
) -> Result<IcloudSyncDeleteAssetsResult, String> {
  let client = sidecar.client();
  tokio::task::spawn_blocking(move || {
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
    run_cloud_delete_once(&app, client.as_ref(), &apple_id, &keys, reason_text)
  })
  .await
  .map_err(|e| format!("任务失败: {e}"))?
}
