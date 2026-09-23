//! QQ 空间同步路径
//! 职责：`<appData>/qzone-sync`；默认输出 `{albumRoot}/QzoneSync`
//! @note 无用户可配 settings（曾有 concurrency，下载未读已删）

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

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

/// 落盘目录写死：`{albumRoot}/QzoneSync`；相册根未配置时返回 None
pub fn resolve_output_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
  let root_dir = load_album_root_dir(app)?;
  if root_dir.trim().is_empty() {
    return Ok(None);
  }
  Ok(Some(Path::new(root_dir.trim()).join("QzoneSync")))
}

/// 读取相册根目录
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
