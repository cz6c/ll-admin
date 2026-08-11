//! 工作日报非敏感配置读写
//! 职责：应用数据目录 `daily-report/settings.json` 的 load/save 与校验
//! 适用：设置页与流水线读配置

use std::fs;
use std::path::PathBuf;

use chrono::Local;
use tauri::{AppHandle, Manager};

use super::schedule::{monday_of, workdays_for_kind};
use super::types::{DailyReportSettings, RECOMMENDED_EXCLUDE_DIR_NAMES};

/// 日报数据根目录：`<appData>/daily-report`
pub fn daily_report_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  let dir = base.join("daily-report");
  fs::create_dir_all(&dir).map_err(|e| format!("创建日报目录失败: {e}"))?;
  Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(daily_report_dir(app)?.join("settings.json"))
}

/// 读取设置；文件不存在时返回默认值
pub fn load_settings(app: &AppHandle) -> Result<DailyReportSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    return Ok(DailyReportSettings::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取设置失败: {e}"))?;
  let mut settings: DailyReportSettings =
    serde_json::from_str(&raw).map_err(|e| format!("解析设置失败: {e}"))?;
  normalize_settings(&mut settings, false);
  Ok(settings)
}

/// 覆盖写入设置（不含 API Key）
pub fn save_settings(app: &AppHandle, settings: &DailyReportSettings) -> Result<(), String> {
  let mut settings = settings.clone();
  normalize_settings(&mut settings, true);
  validate_settings(&settings)?;
  let path = settings_path(app)?;
  let raw = serde_json::to_string_pretty(&settings).map_err(|e| format!("序列化设置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入设置失败: {e}"))
}

/// 保存前校验（在 normalize 之后）
fn validate_settings(settings: &DailyReportSettings) -> Result<(), String> {
  if settings.schedule_enabled && settings.schedule_days.is_empty() {
    return Err("请至少选择一天作为计划触发日".into());
  }
  Ok(())
}

/// 固定策略 + 计划字段规范化
/// @note 开启大小周时星期由规则覆盖（与 UI 只读胶囊一致）
fn normalize_settings(settings: &mut DailyReportSettings, on_save: bool) {
  settings.author_email.clear();
  settings.author_name.clear();
  settings.scan_depth = 0;

  // 保证推荐排除目录始终存在（含 Cursor / agents）
  for name in RECOMMENDED_EXCLUDE_DIR_NAMES {
    if !settings.exclude_dir_names.iter().any(|s| s == name) {
      settings.exclude_dir_names.push((*name).into());
    }
  }
  settings.exclude_dir_names.sort_unstable();
  settings.exclude_dir_names.dedup();

  if settings.schedule_biweekly_enabled {
    // UI：大小周开启后星期胶囊不可手改，落盘以当前周型工作日为准
    settings.schedule_days = workdays_for_kind(settings.schedule_biweekly_anchor_kind);
    if on_save {
      let today = Local::now().date_naive();
      settings.schedule_biweekly_anchor_monday = monday_of(today).format("%Y-%m-%d").to_string();
    }
  } else {
    settings.schedule_biweekly_anchor_monday.clear();
    settings.schedule_days.retain(|d| (1..=7).contains(d));
    settings.schedule_days.sort_unstable();
    settings.schedule_days.dedup();
  }
}
