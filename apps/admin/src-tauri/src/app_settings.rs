//! 应用级本机配置
//! 职责：开机自启、关闭到托盘、AI 接入（Base URL / Model / Key）
//! 适用：admin CS（Tauri）应用设置页与关窗/自启

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
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
  /// 无提交时是否仍调 AI（字段保留便于后续开关）
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

/// 读取应用设置；文件不存在时返回默认值并落盘
pub fn load_settings(app: &AppHandle) -> Result<AppSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    let default = AppSettings::default();
    let _ = save_settings(app, &default);
    return Ok(default);
  }

  let raw = fs::read_to_string(&path).map_err(|e| format!("读取应用设置失败: {e}"))?;
  let settings: AppSettings =
    serde_json::from_str(&raw).map_err(|e| format!("解析应用设置失败: {e}"))?;
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

// ===== AI API Key 钥匙串存取 =====
//
// 优先 OS keyring；Windows 等环境下 keyring 不可用时回退到应用数据目录文件。
// keyring 3 须启用 windows-native 等 feature，否则无真实凭据后端，会出现
// 「保存后本页显示已配置、切走再回来又未配置」——因从未真正落盘。
//
// @note service/user 名沿用日报历史命名，避免升级后老用户已配置的 Key 读不回。

const KEYRING_SERVICE: &str = "com.ll.admin.daily-report";
const KEYRING_USER: &str = "api-key";
/// 回退文件名（仅本机 app_data，权限随用户目录）
const KEY_FALLBACK_FILE: &str = "ai-api-key.local";

fn keyring_entry() -> Result<Entry, String> {
  Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| format!("打开凭据库失败: {e}"))
}

fn key_fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  fs::create_dir_all(&base).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
  Ok(base.join(KEY_FALLBACK_FILE))
}

fn read_key_fallback(app: &AppHandle) -> Result<Option<String>, String> {
  let path = key_fallback_path(app)?;
  if !path.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取本地 Key 回退文件失败: {e}"))?;
  let key = raw.trim().to_string();
  if key.is_empty() {
    Ok(None)
  } else {
    Ok(Some(key))
  }
}

fn write_key_fallback(app: &AppHandle, key: &str) -> Result<(), String> {
  let path = key_fallback_path(app)?;
  if key.is_empty() {
    match fs::remove_file(&path) {
      Ok(()) => Ok(()),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
      Err(e) => Err(format!("删除本地 Key 回退文件失败: {e}")),
    }
  } else {
    fs::write(&path, key).map_err(|e| format!("写入本地 Key 回退文件失败: {e}"))
  }
}

/// 读取 AI Key；未设置时返回 None
pub fn get_ai_api_key(app: &AppHandle) -> Result<Option<String>, String> {
  match keyring_entry() {
    Ok(entry) => match entry.get_password() {
      Ok(p) if !p.is_empty() => return Ok(Some(p)),
      Ok(_) | Err(keyring::Error::NoEntry) => {}
      Err(e) => {
        log::warn!("keyring 读取失败，尝试回退文件: {e}");
      }
    },
    Err(e) => {
      log::warn!("打开 keyring 失败，尝试回退文件: {e}");
    }
  }
  read_key_fallback(app)
}

/// 是否已配置非空 AI Key（钥匙串或回退文件）
pub fn has_ai_api_key(app: &AppHandle) -> Result<bool, String> {
  Ok(get_ai_api_key(app)?.is_some())
}

/// 写入或清空 AI Key（空字符串时删除）
/// @note 同时写钥匙串与回退文件；钥匙串失败不阻断回退文件，保证切页后仍可读回
pub fn set_ai_api_key(app: &AppHandle, key: &str) -> Result<(), String> {
  let key = key.trim();
  let mut keyring_err: Option<String> = None;

  match keyring_entry() {
    Ok(entry) => {
      let kr = if key.is_empty() {
        match entry.delete_credential() {
          Ok(()) => Ok(()),
          Err(keyring::Error::NoEntry) => Ok(()),
          Err(e) => Err(format!("删除 API Key 失败: {e}")),
        }
      } else {
        entry
          .set_password(key)
          .map_err(|e| format!("写入 API Key 失败: {e}"))
      };
      if let Err(e) = kr {
        keyring_err = Some(e);
      }
    }
    Err(e) => {
      keyring_err = Some(e);
    }
  }

  write_key_fallback(app, key)?;

  // 读回校验，避免「写成功假象」
  let stored = get_ai_api_key(app)?;
  if key.is_empty() {
    if stored.is_some() {
      return Err("清空 API Key 后仍能读到旧值".into());
    }
  } else if stored.as_deref() != Some(key) {
    let hint = keyring_err
      .map(|e| format!("（钥匙串: {e}）"))
      .unwrap_or_default();
    return Err(format!("API Key 写入后无法读回{hint}"));
  } else if let Some(e) = keyring_err {
    log::warn!("API Key 已写入回退文件，钥匙串不可用: {e}");
  }

  Ok(())
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

#[tauri::command]
pub fn app_settings_set_ai_api_key(app: AppHandle, key: String) -> Result<(), String> {
  set_ai_api_key(&app, &key)
}

#[tauri::command]
pub fn app_settings_has_ai_api_key(app: AppHandle) -> Result<bool, String> {
  has_ai_api_key(&app)
}
