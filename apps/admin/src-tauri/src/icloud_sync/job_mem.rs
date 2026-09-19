//! 进程内下载/刷新任务
//! 职责：替代已删除的 jobs 表；暂停、续传、状态查询只在本次进程有效
//! @note 进程退出后任务消失，不会从 SQLite 恢复

use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};

use super::types::{JobRow, JobStatus, JobView, TaskType};

static NEXT_ID: AtomicI64 = AtomicI64::new(1);

fn jobs() -> &'static Mutex<HashMap<i64, JobRow>> {
  static JOBS: OnceLock<Mutex<HashMap<i64, JobRow>>> = OnceLock::new();
  JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn with_jobs<T>(f: impl FnOnce(&mut HashMap<i64, JobRow>) -> T) -> Result<T, String> {
  let mut guard = jobs().lock().map_err(|_| "任务内存锁损坏".to_string())?;
  Ok(f(&mut guard))
}

fn is_incomplete(status: JobStatus) -> bool {
  matches!(
    status,
    JobStatus::Cataloging
      | JobStatus::Pending
      | JobStatus::Running
      | JobStatus::PausedSession
      | JobStatus::PausedUser
  )
}

/// 新建内存任务，返回本次进程内的 id
pub fn insert(
  task_type: TaskType,
  view: JobView,
  output_dir: &str,
  apple_id: &str,
  status: JobStatus,
  created_at: i64,
) -> Result<i64, String> {
  let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
  let row = JobRow {
    id,
    task_type,
    view,
    output_dir: output_dir.to_string(),
    apple_id: apple_id.to_string(),
    status,
    mode: "full".into(),
    created_at,
    finished_at: None,
    total_count: 0,
    done_count: 0,
    failed_count: 0,
    pending_count: 0,
  };
  with_jobs(|map| {
    map.insert(id, row);
  })?;
  Ok(id)
}

/// 按 id 读取；进程内没有则 None
pub fn get(job_id: i64) -> Result<Option<JobRow>, String> {
  with_jobs(|map| map.get(&job_id).cloned())
}

/// 暂停/续传/完成只改内存状态
pub fn update_status(job_id: i64, status: JobStatus) -> Result<(), String> {
  with_jobs(|map| {
    let Some(job) = map.get_mut(&job_id) else {
      return Err(format!("任务 {job_id} 不存在"));
    };
    job.status = status;
    Ok(())
  })?
}

/// 把 assets 统计快照写回内存任务
pub fn set_counts(job_id: i64, done: u32, failed: u32, pending: u32) -> Result<(), String> {
  with_jobs(|map| {
    let Some(job) = map.get_mut(&job_id) else {
      return Err(format!("任务 {job_id} 不存在"));
    };
    job.done_count = done;
    job.failed_count = failed;
    job.pending_count = pending;
    job.total_count = done.saturating_add(failed).saturating_add(pending);
    Ok(())
  })?
}

/// 任务结束时刻；写入后计数以快照为准，不再回查已清空的 download_status
pub fn set_finished_at(job_id: i64, finished_at: i64) -> Result<(), String> {
  with_jobs(|map| {
    let Some(job) = map.get_mut(&job_id) else {
      return Err(format!("任务 {job_id} 不存在"));
    };
    job.finished_at = Some(finished_at);
    Ok(())
  })?
}

/// 当前账号未完成任务（至多一条；后写入的优先）
pub fn find_incomplete_for_apple(apple_id: &str) -> Result<Option<JobRow>, String> {
  with_jobs(|map| {
    map
      .values()
      .filter(|job| job.apple_id == apple_id && is_incomplete(job.status))
      .max_by_key(|job| job.id)
      .cloned()
  })
}

/// 取消任务时丢掉内存行；assets 绑定由调用方清
pub fn remove(job_id: i64) -> Result<(), String> {
  with_jobs(|map| {
    map.remove(&job_id);
  })
}
