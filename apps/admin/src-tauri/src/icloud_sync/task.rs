//! iCloud 统一任务门禁
//! 职责：同步 / 删云 / 刷新云目录 全局互斥；同一 Apple ID 同时仅允许一个未完成任务
//! 适用：start_job、一次性删云、refresh_catalog 入口
//!
//! @note 删云已改为一次性消费（不入 jobs）；用内存旗标与 sync/catalog job 互斥

use std::sync::atomic::{AtomicBool, Ordering};

use super::db::{find_incomplete_task_for_apple, get_job};
use super::types::{error_codes, JobRow, JobStatus, TaskType};
use rusqlite::Connection;

/// 一次性删云进行中（不占 jobs，但占用 sidecar / 禁止并行 sync）
static CLOUD_DELETE_BUSY: AtomicBool = AtomicBool::new(false);

/// 是否正在一次性删云
pub fn cloud_delete_in_progress() -> bool {
  CLOUD_DELETE_BUSY.load(Ordering::SeqCst)
}

/**
 * 抢占删云执行槽；已占用则返回 TASK_ACTIVE
 * @note 配对 `end_cloud_delete`；panic 路径也应 end
 */
pub fn try_begin_cloud_delete() -> Result<(), String> {
  if CLOUD_DELETE_BUSY
    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
    .is_err()
  {
    return Err(format!(
      "{}: 正在从 iCloud 移除，请稍候再操作",
      error_codes::TASK_ACTIVE
    ));
  }
  Ok(())
}

/// 释放一次性删云执行槽
pub fn end_cloud_delete() {
  CLOUD_DELETE_BUSY.store(false, Ordering::SeqCst);
}

/// 任务是否仍处于进行中（非终态）
pub fn is_incomplete_status(status: JobStatus) -> bool {
  matches!(
    status,
    JobStatus::Cataloging
      | JobStatus::Pending
      | JobStatus::Running
      | JobStatus::PausedSession
      | JobStatus::PausedUser
  )
}

fn task_type_label(task_type: TaskType) -> &'static str {
  match task_type {
    TaskType::Sync => "下载",
    TaskType::CloudDelete => "移除",
    TaskType::Catalog => "刷新 iCloud 目录",
  }
}

fn starting_label(task_type: TaskType) -> &'static str {
  match task_type {
    TaskType::Sync => "开始下载",
    TaskType::CloudDelete => "从 iCloud 移除",
    TaskType::Catalog => "刷新 iCloud 目录",
  }
}

/// 启动新任务前断言：当前账号无其它未完成任务，且无一次性删云占用
pub fn require_no_incomplete_task(
  conn: &Connection,
  apple_id: &str,
  starting: TaskType,
) -> Result<(), String> {
  // 删云不入 jobs，但仍与 sync/catalog 互斥
  if cloud_delete_in_progress() && starting != TaskType::CloudDelete {
    return Err(format!(
      "{}: 正在从 iCloud 移除，请稍候再{}",
      error_codes::TASK_ACTIVE,
      starting_label(starting)
    ));
  }
  let Some(existing) = find_incomplete_task_for_apple(conn, apple_id)? else {
    return Ok(());
  };
  Err(format!(
    "{}: 已有{}任务进行中（{}），请先取消后再{}",
    error_codes::TASK_ACTIVE,
    task_type_label(existing.task_type),
    existing.id,
    starting_label(starting)
  ))
}

/// discard 前校验 job 仍属于未完成任务
pub fn ensure_discardable(conn: &Connection, job_id: i64) -> Result<JobRow, String> {
  let job = get_job(conn, job_id)?.ok_or_else(|| format!("任务 {job_id} 不存在"))?;
  if !is_incomplete_status(job.status) {
    return Err(format!("任务 {job_id} 已结束，无法取消"));
  }
  Ok(job)
}
