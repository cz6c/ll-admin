//! iCloud 同步队列编排
//! 职责：catalog 落库、index 分配、批量 download、进度事件与 session 暂停续传
//! 适用：Task 6 start/resume/status 命令；mock sidecar 可离线跑通

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use rand::Rng;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::ensure_sidecar_authenticated;
use super::catalog_diff::classify_catalog_rows;
use super::db::{
  apply_catalog_delta, count_assets_by_status, discard_job, enqueue_outstanding_for_full_sync,
  finalize_job_download, get_job,
  insert_job, job_has_assets, list_asset_tasks, list_failed_assets, list_pending_assets,
  load_existing_baselines, mark_asset_outcome, mark_asset_status, mark_catalog_deletions,
  open_db, reset_failed_to_pending, set_job_catalog_counts, state_db_path, update_job_status,
};
use super::naming::format_asset_filename;
use super::settings::{
  load_settings, normalize_concurrency, resolve_default_output_dir,
};
use super::sidecar::{session_dir, SidecarClient, SidecarError, SidecarEvent};
use super::types::{
  error_codes, AssetPart, AssetRow, AssetStatus, IcloudSyncFailedAssetRow,
  IcloudSyncListAssetTasksResult, JobStatus, JobView, MediaKind,
};

const PROGRESS_EVENT: &str = "icloud-sync://progress";
/// 任务状态变更事件；前端据此做 notify 门控与同步页 UI 刷新
const JOB_STATUS_EVENT: &str = "icloud-sync://job-status";
/// catalog / 下载完成 cloud_state 变更后刷新抽屉 summary
pub const CLOUD_STATE_CHANGED_EVENT: &str = "icloud-sync://cloud-state-changed";
/// 批次之间最小间隔，降低 Apple 限流概率
const MIN_BATCH_GAP_MS: u64 = 400;

/// sidecar catalog 单条资产（与 Python mock 字段对齐）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogItem {
  pub asset_id: String,
  pub filename: String,
  pub media_kind: MediaKind,
  pub live_pair_id: Option<String>,
  pub capture_at: Option<String>,
  pub added_at: Option<String>,
  pub parts: Vec<String>,
  /// CloudKit CPLAsset.recordName；catalog 时落库，删云只读库
  pub cpl_asset_record_name: Option<String>,
  /// catalog 时的 recordChangeTag；可按 recordName 定点刷新
  pub cpl_asset_change_tag: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncProgressPayload {
  pub done: u32,
  pub total: u32,
  pub failed: u32,
  pub pending: u32,
  pub filename: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncStartJobResult {
  pub job_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncJobStatusResult {
  pub job_id: i64,
  pub status: JobStatus,
  /// 创建任务时的 Apple ID；与 settings 不一致时前端禁止续传
  pub apple_id: String,
  /// 任务落盘目录（供完成态展示与打开文件夹）
  pub output_dir: String,
  pub total: u32,
  pub done: u32,
  pub failed: u32,
  pub pending: u32,
}

struct QueueRunner {
  active_job_id: Option<i64>,
  /// 用户 pause 时置 true；下载循环在每张之间检查并协作退出
  pause_requested: Arc<AtomicBool>,
}

static QUEUE: OnceLock<Mutex<QueueRunner>> = OnceLock::new();

fn queue_runner() -> &'static Mutex<QueueRunner> {
  QUEUE.get_or_init(|| {
    Mutex::new(QueueRunner {
      active_job_id: None,
      pause_requested: Arc::new(AtomicBool::new(false)),
    })
  })
}

fn clear_pause_request() {
  if let Ok(runner) = queue_runner().lock() {
    runner.pause_requested.store(false, Ordering::SeqCst);
  }
}

fn is_pause_requested() -> bool {
  queue_runner()
    .lock()
    .map(|r| r.pause_requested.load(Ordering::SeqCst))
    .unwrap_or(false)
}

/// 下载 worker 是否占用全局槽位（云删 worker 需让路）
pub fn is_download_worker_active() -> bool {
  queue_runner()
    .lock()
    .map(|r| r.active_job_id.is_some())
    .unwrap_or(false)
}

/// 任务所属 Apple ID 必须与 settings 当前账号一致（单账号换号后旧任务不可续传）
fn ensure_job_matches_current_account(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  job_id: i64,
) -> Result<(), String> {
  let job = get_job(conn, job_id)?.ok_or_else(|| format!("job {job_id} 不存在"))?;
  let settings = load_settings(app)?;
  let job_id_str = job.apple_id.trim();
  let current = settings.apple_id.trim();
  if job_id_str.is_empty() || current.is_empty() || job_id_str == current {
    return Ok(());
  }
  Err(format!(
    "{}: 任务属于 {job_id_str}，当前登录 {current}，请开始新同步",
    error_codes::ACCOUNT_MISMATCH
  ))
}

/// 按视图排序键升序排列 catalog 并校验字段
pub fn sort_and_validate_catalog(items: &mut [CatalogItem], view: JobView) -> Result<(), String> {
  items.sort_by(|a, b| sort_key(a, view).cmp(&sort_key(b, view)));
  for item in items.iter() {
    validate_catalog_item(item, view)?;
  }
  Ok(())
}

fn sort_key(item: &CatalogItem, view: JobView) -> String {
  match view {
    JobView::Library => item.capture_at.clone().unwrap_or_default(),
    JobView::Recents => item.added_at.clone().unwrap_or_default(),
  }
}

/// 校验单条 catalog：排序字段与 Live 强绑定（缺 live_pair_id 视为 catalog 失败）
fn validate_catalog_item(item: &CatalogItem, view: JobView) -> Result<(), String> {
  let sort = sort_key(item, view);
  if sort.is_empty() {
    return Err(error_codes::CATALOG_SORT_MISSING.to_string());
  }
  if item.media_kind == MediaKind::Live && item.live_pair_id.as_deref().unwrap_or("").is_empty() {
    return Err(error_codes::LIVE_BIND_MISSING.to_string());
  }
  if item.media_kind == MediaKind::Live && item.live_pair_id.is_none() {
    return Err(error_codes::LIVE_BIND_MISSING.to_string());
  }
  Ok(())
}

/// 将已排序 catalog 转为 SQLite 资产行；Live still+mov 共享 index_num
pub fn catalog_to_asset_rows(
  view: JobView,
  items: &[CatalogItem],
) -> Result<Vec<AssetRow>, String> {
  let mut sorted = items.to_vec();
  sort_and_validate_catalog(&mut sorted, view)?;

  let mut rows = Vec::new();
  for (idx, item) in sorted.iter().enumerate() {
    let index_num = i32::try_from(idx + 1).map_err(|_| "index 超出 i32 范围".to_string())?;
    for part in &item.parts {
      let asset_part = map_catalog_part(item.media_kind, part)?;
      rows.push(AssetRow {
        id: 0,
        apple_id: String::new(),
        asset_id: item.asset_id.clone(),
        sort_key: sort_key(item, view),
        original_filename: item.filename.clone(),
        media_kind: item.media_kind,
        live_pair_id: item.live_pair_id.clone(),
        index_num,
        part: asset_part,
        download_status: Some(AssetStatus::Pending),
        active_job_id: None,
        dest_path: None,
        cloud_state: super::types::CloudState::CloudOnly,
        last_synced_at: None,
        last_catalog_at: None,
        last_error: None,
        attempt_count: 0,
        cpl_asset_record_name: item.cpl_asset_record_name.clone(),
        cpl_asset_change_tag: item.cpl_asset_change_tag.clone(),
      });
    }
  }
  Ok(rows)
}

fn map_catalog_part(media_kind: MediaKind, part: &str) -> Result<AssetPart, String> {
  match (media_kind, part) {
    (MediaKind::Live, "still") => Ok(AssetPart::Still),
    (MediaKind::Live, "mov") => Ok(AssetPart::Mov),
    (MediaKind::Photo, "still") | (MediaKind::Photo, "full") => Ok(AssetPart::Full),
    (MediaKind::Video, "video") | (MediaKind::Video, "still") => Ok(AssetPart::Full),
    _ => Err(format!("未知 catalog part: {media_kind:?}/{part}")),
  }
}

fn parse_catalog_items(items: &[Value]) -> Result<Vec<CatalogItem>, String> {
  items
    .iter()
    .map(|value| {
      let asset_id = value
        .get("asset_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      let filename = value
        .get("filename")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      let media_kind_s = value
        .get("media_kind")
        .and_then(|v| v.as_str())
        .unwrap_or("");
      let media_kind = MediaKind::parse(media_kind_s)
        .ok_or_else(|| format!("无效 media_kind: {media_kind_s}"))?;
      let live_pair_id = value.get("live_pair_id").and_then(|v| {
        if v.is_null() {
          None
        } else {
          v.as_str().map(str::to_string)
        }
      });
      let capture_at = value
        .get("capture_at")
        .and_then(|v| v.as_str())
        .map(str::to_string);
      let added_at = value
        .get("added_at")
        .and_then(|v| v.as_str())
        .map(str::to_string);
      let parts: Vec<String> = value
        .get("parts")
        .and_then(|v| v.as_array())
        .map(|arr| {
          arr
            .iter()
            .filter_map(|p| p.as_str().map(str::to_string))
            .collect()
        })
        .unwrap_or_default();
      let cpl_asset_record_name = value
        .get("cpl_asset_record_name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
      let cpl_asset_change_tag = value
        .get("cpl_asset_change_tag")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

      Ok(CatalogItem {
        asset_id,
        filename,
        media_kind,
        live_pair_id,
        capture_at,
        added_at,
        parts,
        cpl_asset_record_name,
        cpl_asset_change_tag,
      })
    })
    .collect()
}

fn resolve_output_dir(app: &AppHandle) -> Result<String, String> {
  let settings = load_settings(app)?;
  if !settings.output_dir.trim().is_empty() {
    return Ok(settings.output_dir.trim().to_string());
  }
  resolve_default_output_dir(app)?
    .map(|p| p.to_string_lossy().into_owned())
    .ok_or_else(|| "请配置同步输出目录或相册根目录".to_string())
}

fn sidecar_part_for_download(asset: &AssetRow) -> &'static str {
  match asset.part {
    AssetPart::Mov => "mov",
    AssetPart::Still => "still",
    AssetPart::Full => {
      if asset.media_kind == MediaKind::Video {
        "video"
      } else {
        "still"
      }
    }
  }
}

fn dest_path_for_asset(output_dir: &str, asset: &AssetRow) -> PathBuf {
  let (stem, ext) = filename_stem_ext(&asset.original_filename);
  let ext = match asset.part {
    AssetPart::Mov => "mov".to_string(),
    _ => ext,
  };
  let name = format_asset_filename(asset.index_num as u32, &stem, &ext);
  Path::new(output_dir).join(name)
}

fn filename_stem_ext(filename: &str) -> (String, String) {
  let path = Path::new(filename);
  let stem = path
    .file_stem()
    .and_then(|s| s.to_str())
    .unwrap_or("asset")
    .to_string();
  let ext = path
    .extension()
    .and_then(|s| s.to_str())
    .unwrap_or("bin")
    .to_string();
  (stem, ext)
}

fn emit_progress(
  app: &AppHandle,
  done: u32,
  total: u32,
  failed: u32,
  pending: u32,
  filename: &str,
) {
  let payload = IcloudSyncProgressPayload {
    done,
    total,
    failed,
    pending,
    filename: filename.to_string(),
  };
  let _ = app.emit(PROGRESS_EVENT, &payload);
}

fn emit_progress_from_db(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  job_id: i64,
  total: u32,
  filename: &str,
) {
  let (done, failed, pending) = count_assets_by_status(conn, job_id).unwrap_or((0, 0, 0));
  emit_progress(app, done, total, failed, pending, filename);
}

fn random_jitter_ms() -> u64 {
  // 成功下载后的短间隔：降 Apple 限流风险，又避免 0.5–2s 拖垮大图库全量同步
  rand::thread_rng().gen_range(200..=800)
}

/// 输出目录中目标文件已存在且非空，视为该资产已完成。
/// sidecar 原子落盘成功后若在写 stdout 前断连，Rust 会误判为 pending/paused。
fn local_dest_ready(dest: &Path) -> bool {
  dest.is_file()
    && std::fs::metadata(dest)
      .map(|m| m.len() > 0)
      .unwrap_or(false)
}

/// 磁盘已有有效文件时补记 done，避免重复下载与进度卡在最后一张。
/// 仅精确匹配 `{index:05d}_{sanitized_stem}.{ext}`；原名参与路径以便顺序变化时校验。
fn mark_asset_done_if_on_disk(
  conn: &rusqlite::Connection,
  asset: &AssetRow,
  output_dir: &str,
) -> Result<bool, String> {
  let dest = dest_path_for_asset(output_dir, asset);
  if !local_dest_ready(&dest) {
    return Ok(false);
  }
  mark_asset_status(
    conn,
    asset.id,
    AssetStatus::Done,
    Some(&dest.to_string_lossy()),
  )?;
  Ok(true)
}

/// 扫描 pending 资产：磁盘已有文件则补记 done；若全部完成则将 job 置为 done。
/// @returns 是否在本次 reconcile 中将 job 置为 done（调用方负责 emit）
fn reconcile_job_with_disk(
  conn: &rusqlite::Connection,
  job_id: i64,
  output_dir: &str,
) -> Result<bool, String> {
  let pending = list_pending_assets(conn, job_id)?;
  for asset in &pending {
    mark_asset_done_if_on_disk(conn, asset, output_dir)?;
  }

  let (done, failed, pending) = count_assets_by_status(conn, job_id)?;
  if pending == 0 && failed == 0 && done > 0 {
    update_job_status(conn, job_id, JobStatus::Done)?;
    finalize_job_download(conn, job_id)?;
    return Ok(true);
  }
  Ok(false)
}

fn event_error_code(event: &SidecarEvent) -> Option<&str> {
  event.code.as_deref()
}

fn is_fatal_job_error(code: &str) -> bool {
  code == error_codes::ACCOUNT_LOCKED || code == error_codes::RATE_LIMITED
}

/// 单文件可跳过错误：标 failed 后继续下一批
fn is_skippable_download_error(code: &str) -> bool {
  matches!(
    code,
    error_codes::DOWNLOAD_FAILED
      | error_codes::LIVE_BIND_MISSING
      | error_codes::CATALOG_SORT_MISSING
      | "invalid_request"
      | "io_error"
      | "sidecar_io_error"
  )
}

/// download_batch 超时：基础 120s + 每文件 180s，上限 600s
fn batch_timeout_secs(batch_size: usize) -> u64 {
  (120 + batch_size as u64 * 180).min(600)
}

#[derive(Debug, Clone)]
struct BatchItemResult {
  row_id: i64,
  ok: bool,
  code: String,
  message: String,
}

/// 下载阶段 auth 类错误：暂停 job、保留 SQLite，待用户显式重认证后 resume（不自动重登）
fn is_auth_pause_error(code: &str) -> bool {
  matches!(
    code,
    error_codes::SESSION_EXPIRED
      | error_codes::AUTH_FAILED
      | error_codes::NEED_2FA
      | error_codes::SIDECAR_CRASHED
  )
}

fn fetch_catalog(
  client: &SidecarClient,
  app: &AppHandle,
  view: JobView,
  apple_id: &str,
  session_path: &Path,
) -> Result<Vec<CatalogItem>, String> {
  let event = client
    .request(
      app,
      serde_json::json!({
        "cmd": "catalog",
        "view": view.as_str(),
        "apple_id": apple_id,
        "session_dir": session_path.to_string_lossy(),
      }),
    )
    .map_err(|e| e.to_string())?;

  if event.event_type == "error" {
    let code = event_error_code(&event).unwrap_or("catalog_error");
    let message = event.message.clone().unwrap_or_default();
    if message.is_empty() {
      return Err(code.to_string());
    }
    return Err(format!("{code}: {message}"));
  }
  if event.event_type != "done" {
    return Err(format!("catalog 意外响应: type={}", event.event_type));
  }

  let raw_items = event.items.ok_or_else(|| "catalog 响应缺少 items".to_string())?;
  parse_catalog_items(&raw_items)
}

fn emit_cloud_state_changed(app: &AppHandle) {
  let _ = app.emit(CLOUD_STATE_CHANGED_EVENT, ());
}

/// catalog 落库：降级 B diff → apply_catalog_delta + 标记删除
fn persist_catalog_delta(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  job_id: i64,
  apple_id: &str,
  view: JobView,
  catalog_items: &[CatalogItem],
) -> Result<(), String> {
  let rows = catalog_to_asset_rows(view, catalog_items)?;
  let existing = load_existing_baselines(conn, apple_id)?;
  let (classified, catalog_keys) = classify_catalog_rows(&rows, &existing);
  let mut summary = apply_catalog_delta(conn, job_id, apple_id, &classified)?;
  summary.deleted = mark_catalog_deletions(conn, apple_id, &catalog_keys)?;
  let extra = enqueue_outstanding_for_full_sync(conn, job_id, apple_id, &catalog_keys)?;
  summary.enqueued += extra;
  set_job_catalog_counts(conn, job_id)?;
  log::info!(
    "icloud catalog delta job {job_id}: added={} modified={} unchanged={} deleted={} enqueued={}",
    summary.added,
    summary.modified,
    summary.unchanged,
    summary.deleted,
    summary.enqueued
  );
  emit_cloud_state_changed(app);
  Ok(())
}

fn try_claim_job(job_id: i64) -> Result<(), String> {
  let mut runner = queue_runner()
    .lock()
    .map_err(|_| "queue lock poisoned".to_string())?;
  if runner.active_job_id.is_some() {
    return Err("已有同步任务正在运行".to_string());
  }
  runner.active_job_id = Some(job_id);
  Ok(())
}

fn release_job(job_id: i64) {
  if let Ok(mut runner) = queue_runner().lock() {
    if runner.active_job_id == Some(job_id) {
      runner.active_job_id = None;
    }
  }
}

fn download_batch(
  client: &Arc<SidecarClient>,
  app: &AppHandle,
  assets: &[AssetRow],
  output_dir: &str,
  apple_id: &str,
  session_path: &Path,
  view: JobView,
  concurrency: u32,
) -> Result<Vec<BatchItemResult>, SidecarError> {
  if assets.is_empty() {
    return Ok(Vec::new());
  }

  for asset in assets {
    if let Some(parent) = dest_path_for_asset(output_dir, asset).parent() {
      std::fs::create_dir_all(parent).map_err(|e| SidecarError::new("io_error", e.to_string()))?;
    }
  }

  let items: Vec<Value> = assets
    .iter()
    .map(|asset| {
      let dest = dest_path_for_asset(output_dir, asset);
      serde_json::json!({
        "row_id": asset.id,
        "asset_id": asset.asset_id,
        "part": sidecar_part_for_download(asset),
        "dest_path": dest.to_string_lossy(),
      })
    })
    .collect();

  let timeout = Duration::from_secs(batch_timeout_secs(items.len()));
  let event = client.request_with_timeout(
    app,
    serde_json::json!({
      "cmd": "download_batch",
      "items": items,
      "concurrency": concurrency,
      "view": view.as_str(),
      "apple_id": apple_id,
      "session_dir": session_path.to_string_lossy(),
    }),
    timeout,
  )?;

  parse_download_batch_event(&event, assets)
}

fn parse_download_batch_event(
  event: &SidecarEvent,
  assets: &[AssetRow],
) -> Result<Vec<BatchItemResult>, SidecarError> {
  if event.event_type == "error" {
    let code = event_error_code(event).unwrap_or(error_codes::DOWNLOAD_FAILED);
    let message = event.message.clone().unwrap_or_default();
    return Err(SidecarError::new(code, message));
  }
  if event.event_type != "done" {
    return Err(SidecarError::new(
      error_codes::DOWNLOAD_FAILED,
      format!("download_batch 意外响应: type={}", event.event_type),
    ));
  }

  let raw_results = event
    .extra
    .get("results")
    .and_then(|v| v.as_array())
    .cloned()
    .unwrap_or_default();

  if raw_results.is_empty() && !assets.is_empty() {
    return Err(SidecarError::new(
      error_codes::DOWNLOAD_FAILED,
      "download_batch 响应缺少 results",
    ));
  }

  let mut parsed: Vec<BatchItemResult> = raw_results
    .iter()
    .filter_map(|value| {
      let row_id = value.get("row_id").and_then(|v| v.as_i64())?;
      let ok = value.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
      let code = value
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or(error_codes::DOWNLOAD_FAILED)
        .to_string();
      let message = value
        .get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      Some(BatchItemResult {
        row_id,
        ok,
        code,
        message,
      })
    })
    .collect();

  parsed.sort_by_key(|r| r.row_id);

  if parsed.len() != assets.len() {
    let mut by_id: std::collections::HashMap<i64, BatchItemResult> = parsed
      .into_iter()
      .map(|r| (r.row_id, r))
      .collect();
    parsed = assets
      .iter()
      .map(|asset| {
        by_id.remove(&asset.id).unwrap_or(BatchItemResult {
          row_id: asset.id,
          ok: false,
          code: error_codes::DOWNLOAD_FAILED.to_string(),
          message: "missing batch result".to_string(),
        })
      })
      .collect();
  }

  Ok(parsed)
}

fn apply_batch_results(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  job_id: i64,
  assets: &[AssetRow],
  results: &[BatchItemResult],
  output_dir: &str,
  total: u32,
) -> Result<Option<JobStatus>, String> {
  let mut last_filename = String::new();
  let mut terminal: Option<JobStatus> = None;

  for (asset, result) in assets.iter().zip(results.iter()) {
    last_filename = asset.original_filename.clone();
    let dest = dest_path_for_asset(output_dir, asset);

    if result.ok {
      mark_asset_outcome(
        conn,
        asset.id,
        AssetStatus::Done,
        Some(&dest.to_string_lossy()),
        None,
        None,
      )?;
      continue;
    }

    if mark_asset_done_if_on_disk(conn, asset, output_dir)? {
      continue;
    }

    let code = result.code.as_str();
    let err_summary = if result.message.is_empty() {
      code.to_string()
    } else {
      format!("{code}: {}", result.message)
    };

    if is_auth_pause_error(code) {
      terminal = Some(JobStatus::PausedSession);
      break;
    }
    if is_fatal_job_error(code) {
      mark_asset_outcome(
        conn,
        asset.id,
        AssetStatus::Failed,
        None,
        Some(&err_summary),
        Some(1),
      )?;
      terminal = Some(JobStatus::Failed);
      break;
    }

    mark_asset_outcome(
      conn,
      asset.id,
      AssetStatus::Failed,
      None,
      Some(&err_summary),
      Some(1),
    )?;

    if !is_skippable_download_error(code) {
      terminal = Some(JobStatus::Failed);
      break;
    }
  }

  let (done, failed, pending) = count_assets_by_status(conn, job_id)?;
  emit_progress(app, done, total, failed, pending, &last_filename);

  if let Some(status) = terminal {
    set_job_status(app, conn, job_id, status)?;
    return Ok(Some(status));
  }
  Ok(None)
}

/// 批量下载循环；在后台线程调用
fn run_download_loop(app: AppHandle, job_id: i64, client: Arc<SidecarClient>) {
  let db_path = match state_db_path(&app) {
    Ok(p) => p,
    Err(e) => {
      log::error!("icloud sync db path: {e}");
      release_job(job_id);
      return;
    }
  };

  let outcome = (|| -> Result<(), String> {
    client.ensure_started(&app).map_err(|e| e.to_string())?;

    if let Err(e) = ensure_sidecar_authenticated(&app, client.as_ref()) {
      let conn = open_db(&db_path)?;
      if e.contains(error_codes::NEED_2FA)
        || e.starts_with(error_codes::SESSION_EXPIRED)
        || e.starts_with(error_codes::AUTH_FAILED)
        || e.starts_with(error_codes::SIDECAR_CRASHED)
      {
        set_job_status(&app, &conn, job_id, JobStatus::PausedSession)?;
        return Ok(());
      }
      return Err(e);
    }

    let session_path = session_dir(&app)?;
    let conn = open_db(&db_path)?;
    let job = get_job(&conn, job_id)?
      .ok_or_else(|| format!("job {job_id} 不存在"))?;
    ensure_job_matches_current_account(&app, &conn, job_id)?;
    set_job_status(&app, &conn, job_id, JobStatus::Running)?;

    let settings = load_settings(&app)?;
    let concurrency = normalize_concurrency(settings.concurrency);
    let apple_id = job.apple_id.clone();
    let total = {
      let (d, f, p) = count_assets_by_status(&conn, job_id)?;
      d + f + p
    };

    loop {
      if is_pause_requested() {
        set_job_status(&app, &conn, job_id, JobStatus::PausedUser)?;
        emit_progress_from_db(&app, &conn, job_id, total, "");
        return Ok(());
      }

      let pending = list_pending_assets(&conn, job_id)?;
      if pending.is_empty() {
        set_job_status(&app, &conn, job_id, JobStatus::Done)?;
        emit_progress(&app, total, total, 0, 0, "");
        break;
      }

      let batch_size = usize::try_from(concurrency).unwrap_or(1);
      let mut batch: Vec<AssetRow> = Vec::with_capacity(batch_size);
      for asset in pending {
        if mark_asset_done_if_on_disk(&conn, &asset, &job.output_dir)? {
          emit_progress_from_db(&app, &conn, job_id, total, &asset.original_filename);
          continue;
        }
        batch.push(asset);
        if batch.len() >= batch_size {
          break;
        }
      }

      if batch.is_empty() {
        continue;
      }

      thread::sleep(Duration::from_millis(MIN_BATCH_GAP_MS));

      match download_batch(
        &client,
        &app,
        &batch,
        &job.output_dir,
        &apple_id,
        &session_path,
        job.view,
        concurrency,
      ) {
        Ok(results) => {
          if let Some(status) =
            apply_batch_results(&app, &conn, job_id, &batch, &results, &job.output_dir, total)?
          {
            if status == JobStatus::PausedSession || status == JobStatus::Failed {
              return Ok(());
            }
          }
        }
        Err(err) => {
          let code = err.code.as_str();
          if is_auth_pause_error(code) {
            set_job_status(&app, &conn, job_id, JobStatus::PausedSession)?;
            emit_progress_from_db(
              &app,
              &conn,
              job_id,
              total,
              batch.last().map(|a| a.original_filename.as_str()).unwrap_or(""),
            );
            return Ok(());
          }
          if is_fatal_job_error(code) {
            for asset in &batch {
              let summary = if err.message.is_empty() {
                code.to_string()
              } else {
                format!("{code}: {}", err.message)
              };
              let _ = mark_asset_outcome(
                &conn,
                asset.id,
                AssetStatus::Failed,
                None,
                Some(&summary),
                Some(1),
              );
            }
            set_job_status(&app, &conn, job_id, JobStatus::Failed)?;
            emit_progress_from_db(
              &app,
              &conn,
              job_id,
              total,
              batch.last().map(|a| a.original_filename.as_str()).unwrap_or(""),
            );
            return Err(err.message);
          }
          for asset in &batch {
            if mark_asset_done_if_on_disk(&conn, asset, &job.output_dir)? {
              continue;
            }
            let summary = if err.message.is_empty() {
              code.to_string()
            } else {
              format!("{code}: {}", err.message)
            };
            let _ = mark_asset_outcome(
              &conn,
              asset.id,
              AssetStatus::Failed,
              None,
              Some(&summary),
              Some(1),
            );
          }
          emit_progress_from_db(
            &app,
            &conn,
            job_id,
            total,
            batch.last().map(|a| a.original_filename.as_str()).unwrap_or(""),
          );
          if !is_skippable_download_error(code) {
            set_job_status(&app, &conn, job_id, JobStatus::Failed)?;
            return Err(err.message);
          }
        }
      }

      thread::sleep(Duration::from_millis(random_jitter_ms()));
      if is_pause_requested() {
        set_job_status(&app, &conn, job_id, JobStatus::PausedUser)?;
        emit_progress_from_db(&app, &conn, job_id, total, "");
        return Ok(());
      }
    }
    Ok(())
  })();

  if let Err(e) = outcome {
    log::error!("icloud sync job {job_id} failed: {e}");
    if let Ok(conn) = open_db(&db_path) {
      let _ = set_job_status(&app, &conn, job_id, JobStatus::Failed);
    }
  }

  release_job(job_id);
}

fn spawn_download_loop(app: AppHandle, job_id: i64, client: Arc<SidecarClient>) {
  clear_pause_request();
  thread::spawn(move || run_download_loop(app, job_id, client));
}

/// 后台拉 catalog → 落库 → 启动下载；catalog 在独立线程，不阻塞 Tauri 命令/UI。
fn spawn_catalog_then_download(
  app: AppHandle,
  job_id: i64,
  view: JobView,
  client: Arc<SidecarClient>,
  db_path: PathBuf,
  apple_id: String,
  session_path: PathBuf,
) {
  thread::spawn(move || {
    let outcome = (|| -> Result<(), String> {
      client.ensure_started(&app).map_err(|e| e.to_string())?;
      let catalog_items = fetch_catalog(
        client.as_ref(),
        &app,
        view,
        &apple_id,
        &session_path,
      )?;
      if catalog_items.is_empty() {
        return Err("catalog 为空".to_string());
      }
      let mut conn = open_db(&db_path)?;
      if get_job(&conn, job_id)?.is_none() {
        log::info!("icloud catalog job {job_id} discarded before persist, abort");
        release_job(job_id);
        return Ok(());
      }
      persist_catalog_delta(&app, &conn, job_id, &apple_id, view, &catalog_items)?;
      conn = open_db(&db_path)?;
      if get_job(&conn, job_id)?.is_none() {
        log::info!("icloud catalog job {job_id} discarded before download, abort");
        release_job(job_id);
        return Ok(());
      }
      set_job_status(&app, &conn, job_id, JobStatus::Pending)?;
      spawn_download_loop(app.clone(), job_id, client.clone());
      Ok(())
    })();

    if let Err(e) = outcome {
      log::error!("icloud sync catalog job {job_id} failed: {e}");
      if let Ok(conn) = open_db(&db_path) {
        let _ = set_job_status(&app, &conn, job_id, JobStatus::Failed);
      }
      release_job(job_id);
    }
  });
}

fn build_job_status(conn: &rusqlite::Connection, job_id: i64) -> Result<IcloudSyncJobStatusResult, String> {
  let job = get_job(conn, job_id)?
    .ok_or_else(|| format!("job {job_id} 不存在"))?;
  let (done, failed, pending, total) = if job.status == JobStatus::Done {
    (
      job.done_count,
      job.failed_count,
      job.pending_count,
      job.total_count,
    )
  } else {
    let (d, f, p) = count_assets_by_status(conn, job_id)?;
    (d, f, p, d + f + p)
  };
  Ok(IcloudSyncJobStatusResult {
    job_id,
    status: job.status,
    apple_id: job.apple_id,
    output_dir: job.output_dir,
    total,
    done,
    failed,
    pending,
  })
}

/// 推送任务状态快照；前端按 focus + route 决定 OS / message / 页内
fn emit_job_status(app: &AppHandle, conn: &rusqlite::Connection, job_id: i64) {
  match build_job_status(conn, job_id) {
    Ok(payload) => {
      let _ = app.emit(JOB_STATUS_EVENT, &payload);
    }
    Err(e) => log::warn!("icloud sync emit job status: {e}"),
  }
}

/// 更新任务状态并 emit；download 循环与 pause 等路径统一走此入口
fn set_job_status(
  app: &AppHandle,
  conn: &rusqlite::Connection,
  job_id: i64,
  status: JobStatus,
) -> Result<(), String> {
  update_job_status(conn, job_id, status)?;
  if status == JobStatus::Done {
    finalize_job_download(conn, job_id)?;
    emit_cloud_state_changed(app);
  }
  emit_job_status(app, conn, job_id);
  Ok(())
}

/// 新建任务：立即返回 job_id；catalog + 下载在后台线程执行
#[tauri::command]
pub fn icloud_sync_start_job(
  app: AppHandle,
  view: JobView,
  sidecar: tauri::State<'_, SidecarClientHandle>,
) -> Result<IcloudSyncStartJobResult, String> {
  let client = sidecar.client();
  ensure_sidecar_authenticated(&app, client.as_ref())?;

  let output_dir = resolve_output_dir(&app)?;
  std::fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {e}"))?;

  let settings = load_settings(&app)?;
  let apple_id = settings.apple_id.clone();
  let session_path = session_dir(&app)?;

  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let created_at = chrono::Utc::now().timestamp();
  let job_id = insert_job(
    &conn,
    view,
    &output_dir,
    &apple_id,
    JobStatus::Cataloging,
    created_at,
    "full",
  )?;
  emit_job_status(&app, &conn, job_id);

  try_claim_job(job_id)?;
  spawn_catalog_then_download(
    app,
    job_id,
    view,
    client.clone(),
    db_path,
    apple_id,
    session_path,
  );

  Ok(IcloudSyncStartJobResult { job_id })
}

/// 从断点续传：paused_session 且已有 assets 时不 re-catalog；重试 failed + 继续 pending
#[tauri::command]
pub fn icloud_sync_resume_job(
  app: AppHandle,
  job_id: i64,
  sidecar: tauri::State<'_, SidecarClientHandle>,
) -> Result<(), String> {
  let client = sidecar.client();
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let job = get_job(&conn, job_id)?.ok_or_else(|| format!("job {job_id} 不存在"))?;

  match job.status {
    JobStatus::PausedSession | JobStatus::PausedUser | JobStatus::Pending | JobStatus::Running => {}
    JobStatus::Cataloging => return Err("正在扫描 iCloud 图库，请稍候".to_string()),
    JobStatus::Done => return Err("任务已完成".to_string()),
    JobStatus::Failed => return Err("任务已失败，请新建任务".to_string()),
  }

  if !job_has_assets(&conn, job_id)? {
    return Err("任务无资产记录，请使用 start_job".to_string());
  }

  ensure_job_matches_current_account(&app, &conn, job_id)?;

  if let Some(output_dir) = get_job(&conn, job_id)?.map(|j| j.output_dir) {
    if reconcile_job_with_disk(&conn, job_id, &output_dir)? {
      emit_job_status(&app, &conn, job_id);
      return Ok(());
    }
  }

  try_claim_job(job_id)?;
  if job.status == JobStatus::PausedSession || job.status == JobStatus::PausedUser {
    set_job_status(&app, &conn, job_id, JobStatus::Pending)?;
  }
  reset_failed_to_pending(&conn, job_id)?;
  spawn_download_loop(app, job_id, client.clone());
  Ok(())
}

/// 用户手动暂停：运行中任务协作退出；未在跑线程时直接写 paused_user
#[tauri::command]
pub fn icloud_sync_pause_job(app: AppHandle, job_id: i64) -> Result<(), String> {
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let job = get_job(&conn, job_id)?.ok_or_else(|| format!("job {job_id} 不存在"))?;

  match job.status {
    JobStatus::Cataloging => return Err("正在扫描 iCloud 图库，请稍候".to_string()),
    JobStatus::Running | JobStatus::Pending => {}
    JobStatus::PausedUser => return Ok(()),
    JobStatus::PausedSession => return Err("登录已失效，请先重新登录".to_string()),
    JobStatus::Done => return Err("任务已完成".to_string()),
    JobStatus::Failed => return Err("任务已失败".to_string()),
  }

  let runner = queue_runner()
    .lock()
    .map_err(|_| "queue lock poisoned".to_string())?;

  if runner.active_job_id == Some(job_id) {
    runner.pause_requested.store(true, Ordering::SeqCst);
    Ok(())
  } else {
    set_job_status(&app, &conn, job_id, JobStatus::PausedUser)?;
    Ok(())
  }
}

/// 查询任务进度与状态
#[tauri::command]
pub fn icloud_sync_job_status(app: AppHandle, job_id: i64) -> Result<IcloudSyncJobStatusResult, String> {
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  if let Some(job) = get_job(&conn, job_id)? {
    if reconcile_job_with_disk(&conn, job_id, &job.output_dir)? {
      emit_job_status(&app, &conn, job_id);
    }
  }
  build_job_status(&conn, job_id)
}

/// 列出失败资产摘要，供同步页失败表格展示
#[tauri::command]
pub fn icloud_sync_list_failed_assets(
  app: AppHandle,
  job_id: i64,
  limit: Option<u32>,
) -> Result<Vec<IcloudSyncFailedAssetRow>, String> {
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  list_failed_assets(&conn, job_id, limit.unwrap_or(50))
}

fn parse_asset_task_status_filter(raw: Option<&str>) -> Result<Option<AssetStatus>, String> {
  match raw.map(str::trim).filter(|s| !s.is_empty()) {
    None | Some("all") => Ok(None),
    Some("pending") => Ok(Some(AssetStatus::Pending)),
    Some("done") => Ok(Some(AssetStatus::Done)),
    Some("failed") => Ok(Some(AssetStatus::Failed)),
    Some(other) => Err(format!("无效 status 筛选: {other}")),
  }
}

/// 分页列出任务下全部文件行（含 pending/done/failed）
#[tauri::command]
pub fn icloud_sync_list_asset_tasks(
  app: AppHandle,
  job_id: i64,
  offset: Option<u32>,
  limit: Option<u32>,
  status: Option<String>,
  keyword: Option<String>,
) -> Result<IcloudSyncListAssetTasksResult, String> {
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  let status_filter = parse_asset_task_status_filter(status.as_deref())?;
  let (items, total) = list_asset_tasks(
    &conn,
    job_id,
    offset.unwrap_or(0),
    limit.unwrap_or(50),
    status_filter,
    keyword.as_deref(),
  )?;
  Ok(IcloudSyncListAssetTasksResult { items, total })
}

/// 丢弃本地同步任务（删除 SQLite job/assets）；运行中任务会先请求暂停
#[tauri::command]
pub fn icloud_sync_discard_job(app: AppHandle, job_id: i64) -> Result<(), String> {
  let db_path = state_db_path(&app)?;
  let conn = open_db(&db_path)?;
  if get_job(&conn, job_id)?.is_none() {
    return Ok(());
  }

  let runner = queue_runner()
    .lock()
    .map_err(|_| "queue lock poisoned".to_string())?;
  if runner.active_job_id == Some(job_id) {
    runner.pause_requested.store(true, Ordering::SeqCst);
  }
  drop(runner);

  discard_job(&conn, job_id)?;
  release_job(job_id);
  Ok(())
}

/// 供 mod 注入的 SidecarClient 包装（Tauri State 需 'static + 后台线程 Clone）
pub struct SidecarClientHandle {
  inner: Arc<SidecarClient>,
}

impl SidecarClientHandle {
  pub fn new() -> Self {
    Self {
      inner: Arc::new(SidecarClient::new()),
    }
  }

  pub fn client(&self) -> Arc<SidecarClient> {
    self.inner.clone()
  }
}

impl Default for SidecarClientHandle {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn photo(id: &str, capture: &str, added: &str) -> CatalogItem {
    CatalogItem {
      asset_id: id.into(),
      filename: format!("{id}.JPG"),
      media_kind: MediaKind::Photo,
      live_pair_id: None,
      capture_at: Some(capture.into()),
      added_at: Some(added.into()),
      parts: vec!["still".into()],
      cpl_asset_record_name: Some(format!("CPL-{id}")),
      cpl_asset_change_tag: Some("t".into()),
    }
  }

  fn live(id: &str, pair: &str, capture: &str, added: &str) -> CatalogItem {
    CatalogItem {
      asset_id: id.into(),
      filename: format!("{id}.HEIC"),
      media_kind: MediaKind::Live,
      live_pair_id: Some(pair.into()),
      capture_at: Some(capture.into()),
      added_at: Some(added.into()),
      parts: vec!["still".into(), "mov".into()],
      cpl_asset_record_name: Some(format!("CPL-{id}")),
      cpl_asset_change_tag: Some("t".into()),
    }
  }

  /// 2 normal + 1 live → live still/mov 共享 index 3
  #[test]
  fn assign_indices_two_normal_one_live_shared_index() {
    let items = vec![
      photo("P1", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z"),
      photo("P2", "2024-01-02T00:00:00Z", "2024-01-03T00:00:00Z"),
      live("L1", "LP1", "2024-01-03T00:00:00Z", "2024-01-04T00:00:00Z"),
    ];

    let rows = catalog_to_asset_rows(JobView::Library, &items).expect("rows");
    assert_eq!(rows.len(), 4);

    let p1: Vec<_> = rows.iter().filter(|r| r.asset_id == "P1").collect();
    let p2: Vec<_> = rows.iter().filter(|r| r.asset_id == "P2").collect();
    let live_rows: Vec<_> = rows.iter().filter(|r| r.asset_id == "L1").collect();

    assert_eq!(p1.len(), 1);
    assert_eq!(p1[0].index_num, 1);

    assert_eq!(p2.len(), 1);
    assert_eq!(p2[0].index_num, 2);

    assert_eq!(live_rows.len(), 2);
    assert!(live_rows.iter().all(|r| r.index_num == 3));
    assert_eq!(live_rows[0].part, AssetPart::Still);
    assert_eq!(live_rows[1].part, AssetPart::Mov);
  }

  #[test]
  fn live_without_pair_id_fails_catalog() {
    let mut item = live("L1", "LP1", "2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z");
    item.live_pair_id = None;
    let err = catalog_to_asset_rows(JobView::Library, std::slice::from_ref(&item))
      .expect_err("must fail");
    assert_eq!(err, error_codes::LIVE_BIND_MISSING);
  }

  #[test]
  fn auth_pause_codes_cover_session_auth_2fa_and_sidecar_crash() {
    assert!(is_auth_pause_error(error_codes::SESSION_EXPIRED));
    assert!(is_auth_pause_error(error_codes::AUTH_FAILED));
    assert!(is_auth_pause_error(error_codes::NEED_2FA));
    assert!(is_auth_pause_error(error_codes::SIDECAR_CRASHED));
    assert!(!is_auth_pause_error(error_codes::DOWNLOAD_FAILED));
    assert!(!is_auth_pause_error(error_codes::ACCOUNT_LOCKED));
    assert!(!is_auth_pause_error(error_codes::RATE_LIMITED));
    assert!(!is_auth_pause_error(error_codes::DOMAIN_MISMATCH));
  }

  #[test]
  fn recents_sort_uses_added_at() {
    let items = vec![
      photo("P2", "2024-01-05T00:00:00Z", "2024-01-02T00:00:00Z"),
      photo("P1", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00Z"),
    ];
    let rows = catalog_to_asset_rows(JobView::Recents, &items).expect("rows");
    let p1 = rows.iter().find(|r| r.asset_id == "P1").expect("p1");
    let p2 = rows.iter().find(|r| r.asset_id == "P2").expect("p2");
    assert_eq!(p1.index_num, 1);
    assert_eq!(p2.index_num, 2);
  }

  #[test]
  fn local_dest_ready_requires_nonempty_file() {
    let dir = std::env::temp_dir().join(format!(
      "icloud_sync_dest_ready_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let missing = dir.join("00031_x.jpg");
    assert!(!local_dest_ready(&missing));

    std::fs::write(&missing, b"ok").expect("write");
    assert!(local_dest_ready(&missing));

    std::fs::write(&missing, b"").expect("truncate");
    assert!(!local_dest_ready(&missing));

    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn mark_asset_done_if_on_disk_requires_exact_dest_path() {
    use super::super::db::{insert_job, open_db, upsert_catalog_assets};
    use rusqlite::params;
    use std::time::{SystemTime, UNIX_EPOCH};

    let dir = std::env::temp_dir().join(format!(
      "icloud_sync_exact_dest_{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    std::fs::write(dir.join("00031_only-index.jpg"), b"ok").expect("write");

    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let db_path = std::env::temp_dir().join(format!("icloud-sync-queue-test-{nanos}.db"));
    let conn = open_db(&db_path).expect("open");
    let job_id = insert_job(
      &conn,
      JobView::Library,
      &dir.to_string_lossy(),
      "user@icloud.com",
      JobStatus::Pending,
      1,
      "full",
    )
    .expect("job");

    let mut asset = AssetRow {
      id: 0,
      apple_id: String::new(),
      asset_id: "A31".into(),
      sort_key: "2026-01-01".into(),
      original_filename: "微信图片_20260821145301_14_2.jpg".into(),
      media_kind: MediaKind::Photo,
      live_pair_id: None,
      index_num: 31,
      part: AssetPart::Full,
      download_status: Some(AssetStatus::Pending),
      active_job_id: None,
      dest_path: None,
      cloud_state: super::super::types::CloudState::CloudOnly,
      last_synced_at: None,
      last_catalog_at: None,
      last_error: None,
      attempt_count: 0,
      cpl_asset_record_name: None,
      cpl_asset_change_tag: None,
    };
    upsert_catalog_assets(&conn, job_id, "user@icloud.com", std::slice::from_ref(&asset)).expect("insert");
    asset.id = conn
      .query_row(
        "SELECT id FROM assets WHERE active_job_id = ?1",
        params![job_id],
        |r| r.get(0),
      )
      .expect("asset id");

    assert!(
      !mark_asset_done_if_on_disk(&conn, &asset, &dir.to_string_lossy()).expect("check")
    );

    let expected = dest_path_for_asset(&dir.to_string_lossy(), &asset);
    std::fs::write(&expected, b"ok").expect("write expected");
    assert!(
      mark_asset_done_if_on_disk(&conn, &asset, &dir.to_string_lossy()).expect("check")
    );

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_file(db_path);
  }
}
