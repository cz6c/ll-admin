//! 相册设置读写
//! 职责：`<appData>/album/settings.json` 的 load/save

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::types::AlbumSettings;

/// 相册数据根目录：`<appData>/album`
pub fn album_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  let dir = base.join("album");
  fs::create_dir_all(&dir).map_err(|e| format!("创建相册目录失败: {e}"))?;
  Ok(dir)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(album_dir(app)?.join("settings.json"))
}

/// 读取设置；文件不存在时返回默认值
pub fn load_settings(app: &AppHandle) -> Result<AlbumSettings, String> {
  let path = settings_path(app)?;
  if !path.exists() {
    return Ok(AlbumSettings::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取相册设置失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析相册设置失败: {e}"))
}

/// 覆盖写入设置
pub fn save_settings(app: &AppHandle, settings: &AlbumSettings) -> Result<(), String> {
  let path = settings_path(app)?;
  let raw =
    serde_json::to_string_pretty(settings).map_err(|e| format!("序列化设置失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入设置失败: {e}"))
}
