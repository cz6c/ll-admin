//! 相册 FFmpeg 工具
//! 职责：解析捆绑/系统 `ffmpeg` 路径；HEIC/HEIF 全尺寸解码为 JPEG（缩放由 Rust `thumbnail` 统一处理）
//! 适用：Windows 发布包 `resources/ffmpeg.exe`；开发期 `pnpm run cs:ffmpeg-fetch`
//!
//! Apple HEIC 为 512×512 瓦片网格；`-map 0:v:0` 只会解出单块瓦片，必须让 demuxer 自行拼合全图。

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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

/// HEIC/HEIF → JPEG 全尺寸落盘（不 `-map`，Apple HEIC 多路 512 瓦片需 demuxer 自拼完整画布）
pub fn convert_heif_to_jpeg(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i",
  ]);
  cmd.arg(input);
  cmd.args(["-frames:v", "1", "-q:v", "3"]);
  cmd.arg(output);
  run_ffmpeg(cmd)
}

/// 视频首帧海报图（网格缩略图用）
pub fn extract_video_poster(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i",
  ]);
  cmd.arg(input);
  cmd.args([
    "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "-q:v", "3",
  ]);
  cmd.arg(output);
  run_ffmpeg(cmd)
}

/// ffmpeg 子进程超时上限（秒）：大视频首帧 / 大 HEIC 解码通常数秒内完成，60s 兜底损坏文件卡死
pub const FFMPEG_TIMEOUT_SECS: u64 = 60;
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(FFMPEG_TIMEOUT_SECS);

/// 运行 ffmpeg 子进程：带超时与 stderr 捕获，返回是否成功
/// 失败 / 超时均记录日志，便于定位损坏文件与环境问题
fn run_ffmpeg(mut cmd: Command) -> bool {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  cmd.stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

  let mut child = match cmd.spawn() {
    Ok(c) => c,
    Err(e) => {
      log::warn!("album: ffmpeg 启动失败: {e}");
      return false;
    }
  };

  let mut stderr = child.stderr.take();
  let mut stdout = child.stdout.take();
  // 读 stdout/stderr 的线程：管道写满会阻塞子进程，必须持续 drain
  let stderr_handle = std::thread::spawn(move || {
    let mut buf = Vec::new();
    if let Some(s) = stderr.as_mut() {
      let _ = s.read_to_end(&mut buf);
    }
    buf
  });
  let stdout_handle = std::thread::spawn(move || {
    let mut buf = Vec::new();
    if let Some(s) = stdout.as_mut() {
      let _ = s.read_to_end(&mut buf);
    }
  });

  let start = Instant::now();
  let status = loop {
    match child.try_wait() {
      Ok(Some(status)) => break status,
      Ok(None) => {
        if start.elapsed() >= FFMPEG_TIMEOUT {
          let _ = child.kill();
          let _ = stdout_handle.join();
          let err = stderr_handle.join().unwrap_or_default();
          log::warn!(
            "album: ffmpeg 超时({}s) 已终止；stderr: {}",
            FFMPEG_TIMEOUT.as_secs(),
            String::from_utf8_lossy(&err).trim()
          );
          return false;
        }
        std::thread::sleep(Duration::from_millis(50));
      }
      Err(e) => {
        let _ = child.kill();
        let _ = stdout_handle.join();
        let err = stderr_handle.join().unwrap_or_default();
        log::warn!(
          "album: ffmpeg 等待失败: {e}；stderr: {}",
          String::from_utf8_lossy(&err).trim()
        );
        return false;
      }
    }
  };

  let _ = stdout_handle.join();
  let err = stderr_handle.join().unwrap_or_default();
  if !status.success() {
    log::warn!(
      "album: ffmpeg 退出码 {:?}；stderr: {}",
      status.code(),
      String::from_utf8_lossy(&err).trim()
    );
  }
  status.success()
}

fn temp_jpeg_path() -> PathBuf {
  use std::time::{SystemTime, UNIX_EPOCH};
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  std::env::temp_dir().join(format!("album_ffmpeg_{nanos}.jpg"))
}
