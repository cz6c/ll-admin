//! 工作日报历史落盘
//! 职责：按日读写 `daily-report/reports/YYYY-MM-DD.json`，并列出历史日期
//! 适用：流水线落盘、今日/历史页查询

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use super::settings::daily_report_dir;
use super::types::DailyReport;

fn reports_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = daily_report_dir(app)?.join("reports");
  fs::create_dir_all(&dir).map_err(|e| format!("创建 reports 目录失败: {e}"))?;
  Ok(dir)
}

fn report_path(app: &AppHandle, date: &str) -> Result<PathBuf, String> {
  Ok(reports_dir(app)?.join(format!("{date}.json")))
}

/// 覆盖写入指定日期日报
pub fn save_report(app: &AppHandle, report: &DailyReport) -> Result<(), String> {
  let path = report_path(app, &report.date)?;
  let raw = serde_json::to_string_pretty(report).map_err(|e| format!("序列化日报失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入日报失败: {e}"))
}

/// 读取指定日期；不存在返回 None
pub fn get_report(app: &AppHandle, date: &str) -> Result<Option<DailyReport>, String> {
  let path = report_path(app, date)?;
  if !path.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取日报失败: {e}"))?;
  let report = serde_json::from_str(&raw).map_err(|e| format!("解析日报失败: {e}"))?;
  Ok(Some(report))
}

/// 列出已有日报日期（倒序）
pub fn list_report_dates(app: &AppHandle) -> Result<Vec<String>, String> {
  let dir = reports_dir(app)?;
  let mut dates = Vec::new();
  let entries = fs::read_dir(&dir).map_err(|e| format!("读取 reports 失败: {e}"))?;
  for entry in entries {
    let entry = entry.map_err(|e| format!("遍历 reports 失败: {e}"))?;
    let name = entry.file_name();
    let name = name.to_string_lossy();
    if let Some(date) = name.strip_suffix(".json") {
      dates.push(date.to_string());
    }
  }
  dates.sort();
  dates.reverse();
  Ok(dates)
}
