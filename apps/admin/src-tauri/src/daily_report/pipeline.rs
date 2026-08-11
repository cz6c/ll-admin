//! 工作日报流水线
//! 职责：扫仓 → 生成扫描日志 →（有提交且已配 AI 时）调模型 → 落盘
//! 规则：
//! 1. 未配置 API Key → 直接输出扫描日志
//! 2. 已配置 Key 且有提交 → 用扫描日志调 AI，输出总结
//! 3. 无提交 → 直接输出扫描日志，不调 AI

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::Local;
use tauri::{AppHandle, Emitter};

use super::git::{collect_repo_commits, local_day_bounds, resolve_author};
use super::keyring_store::get_api_key;
use super::scan::scan_git_repos;
use super::scan_log::format_scan_log;
use super::settings::load_settings;
use super::store::save_report;
use super::summarize::summarize_scan_log;
use super::types::{DailyReport, ReportStatus, SummarySource};

static RUNNING: AtomicBool = AtomicBool::new(false);

/// 前端监听此事件刷新今日页
pub const EVENT_FINISHED: &str = "daily-report:finished";

struct RunGuard;

impl Drop for RunGuard {
  fn drop(&mut self) {
    RUNNING.store(false, Ordering::SeqCst);
  }
}

fn try_enter() -> Result<RunGuard, String> {
  if RUNNING
    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
    .is_err()
  {
    return Err("已有日报任务在执行中，请稍后再试".into());
  }
  Ok(RunGuard)
}

fn today_str() -> String {
  Local::now().format("%Y-%m-%d").to_string()
}

fn now_rfc3339() -> String {
  Local::now().to_rfc3339()
}

/// 完整流水线；定时与手动触发均每次执行
pub async fn run_daily_report(app: &AppHandle) -> Result<DailyReport, String> {
  let _guard = try_enter()?;
  let settings = load_settings(app)?;
  let app_ai = crate::app_settings::load_settings(app)?;
  let date = today_str();

  if settings.workspace_root.trim().is_empty() {
    return Err("未配置工作区根目录，请先在设置中选择".into());
  }

  let started_at = now_rfc3339();
  let author = resolve_author(&settings)?;
  let root = PathBuf::from(settings.workspace_root.trim());
  let repos = scan_git_repos(&root, settings.scan_depth, &settings.exclude_dir_names)?;
  let (day_start, day_end) = local_day_bounds(Local::now());

  let mut all_commits = Vec::new();
  let mut repo_stats = Vec::new();
  for repo in repos {
    let result = collect_repo_commits(&repo, &author, day_start, day_end);
    all_commits.extend(result.commits);
    repo_stats.push(result.stat);
  }
  // 跨仓合并后按提交时间升序（从早到晚）
  all_commits.sort_by(|a, b| a.committed_at.cmp(&b.committed_at));

  let scan_log = format_scan_log(&author, day_start, day_end, &repo_stats, &all_commits);
  let has_commits = !all_commits.is_empty();

  let mut report = DailyReport {
    date: date.clone(),
    status: ReportStatus::Failed,
    summary_markdown: scan_log.clone(),
    scan_log,
    summary_source: SummarySource::ScanLogNoKey,
    raw_commits: all_commits,
    repo_stats,
    error: None,
    started_at,
    finished_at: String::new(),
    model_name: app_ai.model_name.clone(),
  };

  // 无提交：只输出扫描日志，不调 AI
  if !has_commits {
    report.status = ReportStatus::Empty;
    report.summary_source = SummarySource::ScanLogNoCommits;
    report.finished_at = now_rfc3339();
    save_report(app, &report)?;
    let _ = app.emit(EVENT_FINISHED, &report);
    return Ok(report);
  }

  // 未配置 AI：直接输出扫描日志
  let key = match get_api_key(app)? {
    Some(k) if !k.is_empty() => k,
    _ => {
      report.status = ReportStatus::Success;
      report.summary_source = SummarySource::ScanLogNoKey;
      report.finished_at = now_rfc3339();
      save_report(app, &report)?;
      let _ = app.emit(EVENT_FINISHED, &report);
      return Ok(report);
    }
  };

  // 有提交 + 已配置 AI：用扫描日志调模型
  log::info!(
    "daily-report: calling AI model={} base={}",
    app_ai.model_name,
    app_ai.model_base_url
  );
  match summarize_scan_log(&app_ai, &settings, &key, &report.scan_log).await {
    Ok(summary) => {
      log::info!("daily-report: AI summary ok, chars={}", summary.len());
      report.status = ReportStatus::Success;
      report.summary_source = SummarySource::Ai;
      report.summary_markdown = summary;
      report.error = None;
    }
    Err(e) => {
      // AI 失败时仍保留扫描日志供阅读
      log::warn!("daily-report: AI summary failed: {e}");
      report.status = ReportStatus::Failed;
      report.summary_source = SummarySource::ScanLogAiFailed;
      report.error = Some(e);
      report.summary_markdown = report.scan_log.clone();
    }
  }

  report.finished_at = now_rfc3339();
  save_report(app, &report)?;
  let _ = app.emit(EVENT_FINISHED, &report);
  Ok(report)
}

/// 定时触发：尊重 schedule 开关与计划日
pub async fn run_scheduled(app: &AppHandle) -> Result<Option<DailyReport>, String> {
  let settings = load_settings(app)?;
  if !settings.schedule_enabled {
    return Ok(None);
  }
  if !super::schedule::schedule_should_run_today(&settings) {
    return Ok(None);
  }
  match run_daily_report(app).await {
    Ok(r) => Ok(Some(r)),
    Err(e) if e.contains("执行中") => Ok(None),
    Err(e) => Err(e),
  }
}
