//! iCloud 同步非敏感配置读写
//! 职责：`<appData>/icloud-sync/settings.json` 的 load/save 与默认输出目录推导
//! 适用：设置页与队列读配置

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::types::IcloudSyncSettings;

/// 未勾选风险告知或账号清单时，`icloud_sync_login` 拒绝并返回此固定文案
pub const CONSENT_REQUIRED_MSG: &str =
  "请先勾选锁号风险告知，并确认已开启「网页访问 iCloud 数据」、已关闭 Advanced Data Protection";

/// 三项 consent 是否均已勾选
pub fn consent_ready(settings: &IcloudSyncSettings) -> bool {
  settings.risk_accepted && settings.checklist_web_access && settings.checklist_adp_off
}

/// 登录前 consent 门禁；未满足时返回 [`CONSENT_REQUIRED_MSG`]
pub fn require_consent(settings: &IcloudSyncSettings) -> Result<(), String> {
  if consent_ready(settings) {
    Ok(())
  } else {
    Err(CONSENT_REQUIRED_MSG.to_string())
  }
}

/// session 目录是否已有 cookie 等持久化文件（供 auth_state 展示，不表示仍有效）
pub fn session_has_files(app: &AppHandle) -> Result<bool, String> {
  let dir = super::sidecar::session_dir(app)?;
  if !dir.is_dir() {
    return Ok(false);
  }
  Ok(std::fs::read_dir(&dir)
    .map_err(|e| format!("读取 session 目录失败: {e}"))?
    .filter_map(Result::ok)
    .any(|entry| entry.path().is_file()))
}

/// iCloud 同步数据根目录：`<appData>/icloud-sync`
pub fn icloud_sync_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  let dir = base.join("icloud-sync");
  fs::create_dir_all(&dir).map_err(|e| format!("创建 iCloud 同步目录失败: {e}"))?;
  Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(icloud_sync_dir(app)?.join("settings.json"))
}

/// 读取设置；文件不存在时返回默认值
pub fn load_settings(app: &AppHandle) -> Result<IcloudSyncSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    return Ok(IcloudSyncSettings::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取 iCloud 同步设置失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析 iCloud 同步设置失败: {e}"))
}

/// 覆盖写入设置（不含 Apple ID 密码）
pub fn save_settings(app: &AppHandle, settings: &IcloudSyncSettings) -> Result<(), String> {
  let path = settings_path(app)?;
  let raw =
    serde_json::to_string_pretty(settings).map_err(|e| format!("序列化 iCloud 同步设置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入 iCloud 同步设置失败: {e}"))
}

/// 默认落盘目录：`{albumRoot}/iCloudSync`；相册根未配置时返回 None
pub fn resolve_default_output_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
  let root_dir = load_album_root_dir(app)?;
  if root_dir.trim().is_empty() {
    return Ok(None);
  }
  Ok(Some(Path::new(root_dir.trim()).join("iCloudSync")))
}

fn load_album_root_dir(app: &AppHandle) -> Result<String, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  let path = base.join("album").join("settings.json");
  if !path.exists() {
    return Ok(String::new());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取相册设置失败: {e}"))?;
  #[derive(Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct AlbumRootOnly {
    #[serde(default)]
    root_dir: String,
  }
  let settings: AlbumRootOnly =
    serde_json::from_str(&raw).map_err(|e| format!("解析相册设置失败: {e}"))?;
  Ok(settings.root_dir)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::types::IcloudSyncSettings;

  #[test]
  fn consent_ready_requires_all_flags() {
    let mut settings = IcloudSyncSettings::default();
    assert!(!consent_ready(&settings));
    settings.risk_accepted = true;
    assert!(!consent_ready(&settings));
    settings.checklist_web_access = true;
    assert!(!consent_ready(&settings));
    settings.checklist_adp_off = true;
    assert!(consent_ready(&settings));
  }

  #[test]
  fn require_consent_returns_fixed_message() {
    let settings = IcloudSyncSettings::default();
    let err = require_consent(&settings).unwrap_err();
    assert_eq!(err, CONSENT_REQUIRED_MSG);
  }
}
