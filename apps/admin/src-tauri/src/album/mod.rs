//! 本地相册
//! 职责：扫描本地目录媒体文件、按子目录分组、识别实况照片；批量生成缩略图
//! 适用：admin CS（Tauri）个人工具

mod scanner;
mod settings;
mod thumbnail;
mod types;

pub use types::{AlbumSettings, MediaGroup};

use tauri::{AppHandle, Manager};

/// 读取相册设置
#[tauri::command]
pub fn album_get_settings(app: AppHandle) -> Result<AlbumSettings, String> {
  settings::load_settings(&app)
}

/// 保存相册设置
#[tauri::command]
pub fn album_save_settings(app: AppHandle, settings: AlbumSettings) -> Result<(), String> {
  settings::save_settings(&app, &settings)
}

/// 扫描根目录，返回按子目录分组的媒体文件（含缩略图路径）
/// 扫描时一次性批量生成缩略图，前端渲染时零 IPC
#[tauri::command]
pub async fn album_scan(app: AppHandle, root: String, thumb_size: u32) -> Result<Vec<MediaGroup>, String> {
  let cache_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法获取应用数据目录: {e}"))?
    .join("album")
    .join("thumbs");

  let app = app.clone();
  tokio::task::spawn_blocking(move || scanner::scan_directory(&app, &root, &cache_dir, thumb_size))
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))?
}
