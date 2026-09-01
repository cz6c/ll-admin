//! iCloud 统一任务门禁
//! 职责：同步 / 删云 / 刷新云目录 全局互斥；同一 Apple ID 同时仅允许一个未完成任务
//! 适用：start_job、删云入队、refresh_catalog 入口

use super::db::{find_incomplete_task_for_apple, get_job};
use super::types::{JobRow, JobStatus, TaskType};
use rusqlite::Connection;

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
    TaskType::Sync => "同步",
    TaskType::CloudDelete => "移除",
    TaskType::Catalog => "刷新 iCloud 目录",
  }
}

fn starting_label(task_type: TaskType) -> &'static str {
  match task_type {
    TaskType::Sync => "开始同步",
    TaskType::CloudDelete => "从 iCloud 移除",
    TaskType::Catalog => "刷新 iCloud 目录",
  }
}

/// 启动新任务前断言：当前账号无其它未完成任务
pub fn require_no_incomplete_task(
  conn: &Connection,
  apple_id: &str,
  starting: TaskType,
) -> Result<(), String> {
  let Some(existing) = find_incomplete_task_for_apple(conn, apple_id)? else {
    return Ok(());
  };
  Err(format!(
    "task_active: 已有{}任务进行中（{}），请先取消后再{}",
    task_type_label(existing.task_type),
    existing.id,
    starting_label(starting)
  ))
}

/// 读取未完成任务；job 不存在时 None
pub fn get_incomplete_task(conn: &Connection, apple_id: &str) -> Result<Option<JobRow>, String> {
  find_incomplete_task_for_apple(conn, apple_id)
}

/// discard 前校验 job 仍属于未完成任务
pub fn ensure_discardable(conn: &Connection, job_id: i64) -> Result<JobRow, String> {
  let job = get_job(conn, job_id)?.ok_or_else(|| format!("任务 {job_id} 不存在"))?;
  if !is_incomplete_status(job.status) {
    return Err(format!("任务 {job_id} 已结束，无法取消"));
  }
  Ok(job)
}
