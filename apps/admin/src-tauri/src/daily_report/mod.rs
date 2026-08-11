//! 本机 Git 工作日报
//! 职责：扫仓采集当日提交、BYOK 调模型总结、落盘历史；供 Tauri 命令与定时器调用
//! 适用：admin CS（Tauri）个人工具，不进 Web / server

mod git;
mod keyring_store;
mod pipeline;
mod scan;
mod scan_log;
mod schedule;
mod scheduler;
mod settings;
mod store;
mod summarize;
mod types;

pub use scheduler::{start as start_scheduler, ScheduleState};
pub use settings::load_settings;
pub use types::{DailyReportSettings, DEFAULT_PROMPT_TEMPLATE};

use tauri::AppHandle;

use types::DailyReport;

/// 返回内置默认 Prompt（供设置页「恢复默认」）
#[tauri::command]
pub fn daily_report_default_prompt() -> String {
  DEFAULT_PROMPT_TEMPLATE.to_string()
}

#[tauri::command]
pub fn daily_report_get_settings(app: AppHandle) -> Result<DailyReportSettings, String> {
  settings::load_settings(&app)
}

#[tauri::command]
pub fn daily_report_save_settings(
  app: AppHandle,
  settings: DailyReportSettings,
) -> Result<(), String> {
  // 托盘 / 自启 / AI 接入已迁到 app_settings；保存日报配置时保留磁盘上旧字段以免误覆盖
  let mut settings = settings;
  if let Ok(prev) = settings::load_settings(&app) {
    settings.minimize_to_tray_on_close = prev.minimize_to_tray_on_close;
    settings.autostart = prev.autostart;
    settings.model_base_url = prev.model_base_url;
    settings.model_name = prev.model_name;
    settings.call_ai_when_empty = prev.call_ai_when_empty;
  }
  settings::save_settings(&app, &settings)
}

#[tauri::command]
pub fn daily_report_set_api_key(app: AppHandle, key: String) -> Result<(), String> {
  keyring_store::set_api_key(&app, &key)
}

#[tauri::command]
pub fn daily_report_has_api_key(app: AppHandle) -> Result<bool, String> {
  keyring_store::has_api_key(&app)
}

#[tauri::command]
pub fn daily_report_list(app: AppHandle) -> Result<Vec<String>, String> {
  store::list_report_dates(&app)
}

#[tauri::command]
pub fn daily_report_get(app: AppHandle, date: String) -> Result<Option<DailyReport>, String> {
  store::get_report(&app, &date)
}

#[tauri::command]
pub async fn daily_report_run(app: AppHandle) -> Result<DailyReport, String> {
  let report = pipeline::run_daily_report(&app).await?;
  scheduler::notify_report(&app, &report.date, report.error.as_deref());
  Ok(report)
}

