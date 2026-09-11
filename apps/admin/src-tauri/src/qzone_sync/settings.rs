//! QQ 空间同步非敏感配置
//! 职责：`<appData>/qzone-sync/settings.json`；默认输出 `{albumRoot}/QzoneSync`

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::types::QzoneSyncSettings;

/// 规整并发：1–3
pub fn normalize_concurrency(raw: u32) -> u32 {
  raw.clamp(1, 3)
}

/// `<appData>/qzone-sync`
pub fn qzone_sync_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  let dir = base.join("qzone-sync");
  fs::create_dir_all(&dir).map_err(|e| format!("创建 QQ 空间同步目录失败: {e}"))?;
  Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(qzone_sync_dir(app)?.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> Result<QzoneSyncSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    return Ok(QzoneSyncSettings::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取 QQ 空间同步设置失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析 QQ 空间同步设置失败: {e}"))
}

pub fn save_settings(app: &AppHandle, settings: &QzoneSyncSettings) -> Result<(), String> {
  let path = settings_path(app)?;
  let mut normalized = settings.clone();
  normalized.concurrency = normalize_concurrency(settings.concurrency);
  let raw = serde_json::to_string_pretty(&normalized)
    .map_err(|e| format!("序列化 QQ 空间同步设置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入 QQ 空间同步设置失败: {e}"))
}

/// 默认落盘：`{albumRoot}/QzoneSync`
pub fn resolve_default_output_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
  let root_dir = load_album_root_dir(app)?;
  if root_dir.trim().is_empty() {
    return Ok(None);
  }
  Ok(Some(Path::new(root_dir.trim()).join("QzoneSync")))
}

pub fn load_album_root_dir(app: &AppHandle) -> Result<String, String> {
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

/// 当前输出目录：自定义或默认
pub fn resolve_output_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let settings = load_settings(app)?;
  let trimmed = settings.output_dir.trim();
  if !trimmed.is_empty() {
    return Ok(PathBuf::from(trimmed));
  }
  resolve_default_output_dir(app)?
    .ok_or_else(|| "请先在设置中配置相册根目录".into())
}
