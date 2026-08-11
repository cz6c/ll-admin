//! 应用级本机配置
//! 职责：开机自启、关闭到托盘、AI 接入（Base URL / Model / Key）；与日报业务设置隔离
//! 适用：admin CS（Tauri）应用设置页与关窗/自启/总结流水线

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// 应用级非敏感配置（存 `<appData>/app-settings.json`；API Key 在钥匙串）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  /// 点关闭时隐藏到托盘而非退出
  pub minimize_to_tray_on_close: bool,
  /// 随系统开机启动
  pub autostart: bool,
  /// OpenAI 兼容 Chat Completions Base URL
  #[serde(default = "default_model_base_url")]
  pub model_base_url: String,
  /// 模型名
  #[serde(default = "default_model_name")]
  pub model_name: String,
  /// 无提交时是否仍调 AI（当前流水线固定不调；字段保留便于后续开关）
  #[serde(default)]
  pub call_ai_when_empty: bool,
}

fn default_model_base_url() -> String {
  "https://api.openai.com/v1".into()
}

fn default_model_name() -> String {
  "gpt-4o-mini".into()
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      minimize_to_tray_on_close: true,
      autostart: false,
      model_base_url: default_model_base_url(),
      model_name: default_model_name(),
      call_ai_when_empty: false,
    }
  }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  fs::create_dir_all(&base).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
  Ok(base.join("app-settings.json"))
}

fn migrate_from_daily(app: &AppHandle) -> AppSettings {
  crate::daily_report::load_settings(app)
    .map(|s| AppSettings {
      minimize_to_tray_on_close: s.minimize_to_tray_on_close,
      autostart: s.autostart,
      model_base_url: s.model_base_url,
      model_name: s.model_name,
      call_ai_when_empty: s.call_ai_when_empty,
    })
    .unwrap_or_default()
}

/// 读取应用设置；文件不存在或缺少 AI 字段时从旧版日报设置迁移
pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    let migrated = migrate_from_daily(app);
    let _ = save_settings(app, &migrated);
    return Ok(migrated);
  }

  let raw = fs::read_to_string(&path).map_err(|e| format!("读取应用设置失败: {e}"))?;
  let value: serde_json::Value =
    serde_json::from_str(&raw).map_err(|e| format!("解析应用设置失败: {e}"))?;
  // 旧版 app-settings 仅有托盘/自启时补迁 AI 字段
  let needs_ai_migrate = value.get("modelBaseUrl").is_none();
  let mut settings: AppSettings =
    serde_json::from_value(value).map_err(|e| format!("解析应用设置失败: {e}"))?;
  if needs_ai_migrate {
    if let Ok(daily) = crate::daily_report::load_settings(app) {
      settings.model_base_url = daily.model_base_url;
      settings.model_name = daily.model_name;
      settings.call_ai_when_empty = daily.call_ai_when_empty;
    }
    let _ = save_settings(app, &settings);
  }
  Ok(settings)
}

/// 覆盖写入应用设置
pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
  let path = settings_path(app)?;
  let raw = serde_json::to_string_pretty(settings).map_err(|e| format!("序列化应用设置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入应用设置失败: {e}"))
}

/// 同步开机自启插件状态（失败仅记日志）
fn sync_autostart(app: &AppHandle, want: bool) {
  use tauri_plugin_autostart::ManagerExt;
  let manager = app.autolaunch();
  let enabled = manager.is_enabled().unwrap_or(false);
  if want && !enabled {
    if let Err(e) = manager.enable() {
      log::warn!("enable autostart failed: {e}");
    }
  } else if !want && enabled {
    if let Err(e) = manager.disable() {
      log::warn!("disable autostart failed: {e}");
    }
  }
}

#[tauri::command]
pub fn app_settings_get(app: AppHandle) -> Result<AppSettings, String> {
  load_settings(&app)
}

#[tauri::command]
pub fn app_settings_save(app: AppHandle, settings: AppSettings) -> Result<(), String> {
  save_settings(&app, &settings)?;
  sync_autostart(&app, settings.autostart);
  Ok(())
}
