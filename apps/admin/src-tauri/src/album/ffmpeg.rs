//! 相册 FFmpeg 工具
//! 职责：解析捆绑/系统 `ffmpeg` 路径；HEIC/HEIF 全尺寸解码为 JPEG（缩放由 Rust `thumbnail` 统一处理）
//! 适用：Windows 发布包 `resources/ffmpeg.exe`；开发期 `pnpm run cs:ffmpeg-fetch`
//!
//! Apple HEIC 为 512×512 瓦片网格；`-map 0:v:0` 只会解出单块瓦片，必须让 demuxer 自行拼合全图。

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};

/// 与 `tauri.conf.json > bundle.resources` 路径一致
pub const FFMPEG_BUNDLE_PATH: &str = "resources/ffmpeg.exe";

/// 解析可用于 HEIC 解码的 ffmpeg 可执行文件路径
pub fn resolve_ffmpeg_binary(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(raw) = std::env::var("ALBUM_FFMPEG_CMD") {
    let path = PathBuf::from(raw.trim());
    if path.is_file() {
      return Some(path);
    }
  }

  let mut checked: Vec<PathBuf> = Vec::new();

  if let Ok(resolved) = app
    .path()
    .resolve(FFMPEG_BUNDLE_PATH, tauri::path::BaseDirectory::Resource)
  {
    checked.push(resolved);
  }

  #[cfg(debug_assertions)]
  {
    checked.push(
      PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("ffmpeg.exe"),
    );
  }

  for path in checked {
    if path.is_file() {
      return Some(path);
    }
  }

  which_ffmpeg_in_path()
}

/// 在 PATH 中查找 `ffmpeg` / `ffmpeg.exe`
fn which_ffmpeg_in_path() -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  for dir in std::env::split_paths(&path_var) {
    #[cfg(windows)]
    let candidate = dir.join("ffmpeg.exe");
    #[cfg(not(windows))]
    let candidate = dir.join("ffmpeg");
    if candidate.is_file() {
      return Some(candidate);
    }
  }
  None
}

/// 用 FFmpeg 将 HEIC/HEIF 全尺寸解码为 `DynamicImage`
pub fn decode_heif_via_ffmpeg(ffmpeg: &Path, input: &Path) -> Option<image::DynamicImage> {
  let tmp = temp_jpeg_path();
  if !convert_heif_to_jpeg(ffmpeg, input, &tmp) {
    let _ = std::fs::remove_file(&tmp);
    return None;
  }
  let img = image::open(&tmp).ok();
  let _ = std::fs::remove_file(&tmp);
  img
}

/// HEIC/HEIF → JPEG 全尺寸落盘（不做缩放、不 `-map` 单路流）
pub fn convert_heif_to_jpeg(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
  ]);
  cmd.arg(input);
  // 禁止 -map：Apple HEIC 多路 512 瓦片需由 demuxer 拼成完整画布
  cmd.args(["-frames:v", "1", "-q:v", "3"]);
  cmd.arg(output);

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  cmd.status().map(|s| s.success()).unwrap_or(false)
}

/// 视频首帧海报图（网格缩略图用）
pub fn extract_video_poster(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
  ]);
  cmd.arg(input);
  cmd.args(["-frames:v", "1", "-q:v", "5"]);
  cmd.arg(output);

  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  cmd.status().map(|s| s.success()).unwrap_or(false)
}

fn temp_jpeg_path() -> PathBuf {
  use std::time::{SystemTime, UNIX_EPOCH};
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  std::env::temp_dir().join(format!("album_ffmpeg_{nanos}.jpg"))
}
