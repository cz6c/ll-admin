//! 相册 FFmpeg 工具
//! 职责：解析捆绑/系统 `ffmpeg` / `ffprobe`；HEIC 解码；视频首帧；HEVC→H.264 播放代理转码
//! 适用：Windows 发布包 `resources/ffmpeg.exe`；开发期 `pnpm run cs:ffmpeg-fetch`
//!
//! Apple HEIC 为 512×512 瓦片网格；`-map 0:v:0` 只会解出单块瓦片，必须让 demuxer 自行拼合全图。

use std::collections::{HashSet, VecDeque};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

/// 与 `tauri.conf.json > bundle.resources` 路径一致
pub const FFMPEG_BUNDLE_PATH: &str = "resources/ffmpeg.exe";
pub const FFPROBE_BUNDLE_PATH: &str = "resources/ffprobe.exe";

/// HEVC 转 H.264 播放代理超时（秒）；实况 MOV 通常数秒，长片需更久
pub const PLAYBACK_TRANSCODE_TIMEOUT_SECS: u64 = 180;

/// 播放代理最长边。不超过此值保持源分辨率；超出才缩小，CRF / preset 不变
pub const PLAYBACK_MAX_EDGE: u32 = 3840;

/// 可用物理内存低于此值时，转码与 HEIC 全尺寸解码并发降到 1
const MEMORY_PRESSURE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

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

/// 解析 ffprobe 可执行文件（与 ffmpeg 同目录 bundle）
pub fn resolve_ffprobe_binary(app: &AppHandle) -> Option<PathBuf> {
  if let Ok(raw) = std::env::var("ALBUM_FFPROBE_CMD") {
    let path = PathBuf::from(raw.trim());
    if path.is_file() {
      return Some(path);
    }
  }

  let mut checked: Vec<PathBuf> = Vec::new();
  if let Ok(resolved) = app
    .path()
    .resolve(FFPROBE_BUNDLE_PATH, tauri::path::BaseDirectory::Resource)
  {
    checked.push(resolved);
  }
  #[cfg(debug_assertions)]
  {
    checked.push(
      PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("ffprobe.exe"),
    );
  }
  for path in checked {
    if path.is_file() {
      return Some(path);
    }
  }
  which_tool_in_path("ffprobe")
}

fn which_tool_in_path(name: &str) -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  for dir in std::env::split_paths(&path_var) {
    #[cfg(windows)]
    let candidate = dir.join(format!("{name}.exe"));
    #[cfg(not(windows))]
    let candidate = dir.join(name);
    if candidate.is_file() {
      return Some(candidate);
    }
  }
  None
}

/// 一次 ffprobe：编码名 + 宽高 + 时长（打开视频 / 扫描回填复用，避免多次起进程）
#[derive(Debug, Clone, Default)]
pub struct VideoStreamInfo {
  pub codec: Option<String>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  /// 容器时长（毫秒）；ffprobe 报 `N/A` 或 ≤0 时为 None
  pub duration_ms: Option<u64>,
}

/// 读取视频流 codec / width / height 与容器 duration；失败返回 None（stdout 空或非成功）
pub fn probe_video_stream_info(ffprobe: &Path, input: &Path) -> Option<VideoStreamInfo> {
  let mut cmd = Command::new(ffprobe);
  cmd.args([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height:format=duration",
    "-of",
    "default=noprint_wrappers=1",
  ]);
  cmd.arg(input);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }
  let output = cmd.output().ok()?;
  if !output.status.success() {
    return None;
  }
  parse_video_stream_info(&String::from_utf8_lossy(&output.stdout))
}

/// 解析 ffprobe `key=value` 输出；stream 与 format 两段混排，用 key 区分比按 CSV 列位更稳
fn parse_video_stream_info(stdout: &str) -> Option<VideoStreamInfo> {
  let mut info = VideoStreamInfo::default();
  for line in stdout.lines() {
    let Some((key, value)) = line.trim().split_once('=') else {
      continue;
    };
    let value = value.trim();
    match key.trim() {
      "codec_name" if !value.is_empty() => info.codec = Some(value.to_lowercase()),
      "width" => info.width = value.parse::<u32>().ok().filter(|&w| w > 0),
      "height" => info.height = value.parse::<u32>().ok().filter(|&h| h > 0),
      "duration" => {
        info.duration_ms = value
          .parse::<f64>()
          .ok()
          .filter(|s| s.is_finite() && *s > 0.0)
          .map(|s| (s * 1000.0).round() as u64)
      }
      _ => {}
    }
  }
  if info.codec.is_none()
    && info.width.is_none()
    && info.height.is_none()
    && info.duration_ms.is_none()
  {
    return None;
  }
  Some(info)
}

/// 读取视频流 codec_name（如 hevc / h264）；无视频流或失败返回 None
pub fn probe_video_codec(ffprobe: &Path, input: &Path) -> Option<String> {
  probe_video_stream_info(ffprobe, input)?.codec
}

/// WebView2 `<video>` 是否需转码：HEVC 在 Windows 上常缺系统解码器
pub fn needs_playback_transcode(codec: &str) -> bool {
  matches!(
    codec.to_lowercase().as_str(),
    "hevc" | "h265" | "hev1" | "hvc1"
  )
}

/// 代理 MP4 是否可被 WebView 硬解（H.264 baseline 兼容）
pub fn is_web_playable_h264(ffprobe: &Path, input: &Path) -> bool {
  probe_video_codec(ffprobe, input).is_some_and(|c| c == "h264")
}

/// iPhone / iCloud 落盘 MOV 一律走代理：codec 探测不可靠且实况多为 HEVC
pub fn prefer_playback_proxy(ext: &str) -> bool {
  ext == "mov"
}

/// 可用内存是否吃紧（仅用于降低转码 / HEIC 并发，不改画质、不改成打开才解码）
pub fn under_memory_pressure() -> bool {
  available_memory_bytes().is_some_and(|n| n < MEMORY_PRESSURE_BYTES)
}

/// 转码并发：常态 2，内存吃紧为 1
pub fn transcode_parallelism(jobs: usize) -> usize {
  let cap = if under_memory_pressure() { 1 } else { 2 };
  cap.min(jobs).max(1)
}

/// 播放代理滤镜：最长边超过 3840 才缩小，并保证 yuv420p 偶数尺寸
pub fn playback_video_filter() -> String {
  let edge = PLAYBACK_MAX_EDGE;
  format!(
    "scale=w='min({edge},iw)':h='min({edge},ih)':force_original_aspect_ratio=decrease,\
     scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"
  )
}

#[cfg(windows)]
fn available_memory_bytes() -> Option<u64> {
  use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
  unsafe {
    let mut status = MEMORYSTATUSEX::default();
    status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    GlobalMemoryStatusEx(&mut status).ok()?;
    Some(status.ullAvailPhys)
  }
}

#[cfg(not(windows))]
fn available_memory_bytes() -> Option<u64> {
  None
}

struct TranscodeGate {
  used: usize,
}

fn transcode_gate() -> &'static (Mutex<TranscodeGate>, Condvar) {
  static GATE: std::sync::OnceLock<(Mutex<TranscodeGate>, Condvar)> = std::sync::OnceLock::new();
  GATE.get_or_init(|| {
    (
      Mutex::new(TranscodeGate { used: 0 }),
      Condvar::new(),
    )
  })
}

/// 全局转码槽：扫描预热与打开兜底共用，避免两池叠满 CPU
fn with_transcode_permit<T>(work: impl FnOnce() -> T) -> T {
  let limit = if under_memory_pressure() { 1 } else { 2 };
  let (lock, cv) = transcode_gate();
  {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    while guard.used >= limit {
      guard = cv.wait(guard).unwrap_or_else(|e| e.into_inner());
    }
    guard.used += 1;
  }
  let result = work();
  {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    guard.used = guard.used.saturating_sub(1);
    cv.notify_one();
  }
  result
}

fn flight_key(output: &Path) -> String {
  output.to_string_lossy().trim_end_matches(".partial").to_string()
}

fn nonempty_file(path: &Path) -> bool {
  path.is_file() && std::fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false)
}

struct FlightState {
  inflight: HashSet<String>,
}

fn flight_state() -> &'static (Mutex<FlightState>, Condvar) {
  static FLIGHT: std::sync::OnceLock<(Mutex<FlightState>, Condvar)> = std::sync::OnceLock::new();
  FLIGHT.get_or_init(|| (Mutex::new(FlightState { inflight: HashSet::new() }), Condvar::new()))
}

/// 同一输出路径只允许一个 ffmpeg 转码；后者等待完成后直接复用成品
fn with_transcode_single_flight(output: &Path, work: impl FnOnce() -> bool) -> bool {
  let key = flight_key(output);
  let final_path = PathBuf::from(&key);
  let (lock, cv) = flight_state();
  {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    while guard.inflight.contains(&key) {
      guard = cv.wait(guard).unwrap_or_else(|e| e.into_inner());
    }
    if nonempty_file(&final_path) || nonempty_file(output) {
      return true;
    }
    guard.inflight.insert(key.clone());
  }
  let result = work();
  {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    guard.inflight.remove(&key);
    cv.notify_all();
  }
  result
}

static NUDGE: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
static PREWARM_ACTIVE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 查看器邻项插到预热队列头；预热进行中由扫描循环消化，否则由调用方自己 drain
pub fn push_playback_nudge(paths: &[String]) {
  let mut queue = NUDGE.lock().unwrap_or_else(|e| e.into_inner());
  for path in paths.iter().rev() {
    let path = path.trim();
    if path.is_empty() || queue.iter().any(|p| p == path) {
      continue;
    }
    queue.push_front(path.to_string());
  }
}

/// 取出一条队首播放预热；无则 None
pub fn pop_playback_nudge() -> Option<String> {
  NUDGE.lock().unwrap_or_else(|e| e.into_inner()).pop_front()
}

pub fn set_prewarm_active(active: bool) {
  PREWARM_ACTIVE.store(active, std::sync::atomic::Ordering::SeqCst);
}

pub fn prewarm_is_active() -> bool {
  PREWARM_ACTIVE.load(std::sync::atomic::Ordering::SeqCst)
}

/// HEVC 等 → H.264 MP4，供 WebView 原生播放
/// @note Live Photo MOV 常无音轨：`-map 0:a?` 可选；`-tag:v avc1` 提升 WebView 兼容
/// @note `-threads 2`：预热多路并行时限制单进程线程数，避免嵌套打满 CPU/内存
/// @note 单飞 + 全局槽：同一代理不会双开 ffmpeg，扫描与打开兜底合计不超过 2 路
pub fn transcode_for_web_playback(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let owned_out = output.to_path_buf();
  let owned_in = input.to_path_buf();
  let owned_ff = ffmpeg.to_path_buf();
  with_transcode_single_flight(&owned_out, || {
    let final_path = PathBuf::from(flight_key(&owned_out));
    if nonempty_file(&final_path) || nonempty_file(&owned_out) {
      return true;
    }
    with_transcode_permit(|| transcode_for_web_playback_inner(&owned_ff, &owned_in, &owned_out))
  })
}

fn transcode_for_web_playback_inner(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let vf = playback_video_filter();
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "2",
    "-y",
    "-i",
  ]);
  cmd.arg(input);
  cmd.args([
    "-map",
    "0:v:0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-threads",
    "2",
    "-vf",
  ]);
  cmd.arg(&vf);
  cmd.args([
    "-tag:v",
    "avc1",
    "-movflags",
    "+faststart",
    "-map",
    "0:a?",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "mp4",
  ]);
  cmd.arg(output);
  run_ffmpeg_with_timeout(cmd, Duration::from_secs(PLAYBACK_TRANSCODE_TIMEOUT_SECS))
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

/// `image` crate 解不开的栅格图（畸形/非标 JPG 等）经 ffmpeg 转一帧 JPEG 再解码
/// @param max_side `Some(n)` 时边解边缩到最长边 ≤ n（超大图缩略图避免全尺寸进内存）
/// @note 与 HEIC 全尺寸 preview 路径分离；失败由调用方决定是否回退原图路径
pub fn decode_raster_via_ffmpeg(
  ffmpeg: &Path,
  input: &Path,
  max_side: Option<u32>,
) -> Option<image::DynamicImage> {
  // 管道出一帧 JPEG，避免临时文件再读回
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "2",
    "-y",
    "-i",
  ]);
  cmd.arg(input);
  if let Some(side) = max_side.filter(|&s| s > 0) {
    // force_original_aspect_ratio=decrease：不放大，只把过长边压到 side
    cmd.args([
      "-vf",
      &format!("scale={side}:{side}:force_original_aspect_ratio=decrease"),
    ]);
  }
  cmd.args([
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-c:v",
    "mjpeg",
    "-q:v",
    "3",
    "pipe:1",
  ]);
  let (ok, bytes) = run_ffmpeg_capturing(cmd, FFMPEG_TIMEOUT);
  if !ok || bytes.is_empty() {
    return None;
  }
  image::load_from_memory(&bytes).ok()
}

/// HEIC/HEIF → JPEG 全尺寸落盘（不 `-map`，Apple HEIC 多路 512 瓦片需 demuxer 自拼完整画布）
pub fn convert_heif_to_jpeg(ffmpeg: &Path, input: &Path, output: &Path) -> bool {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "2",
    "-y",
    "-i",
  ]);
  cmd.arg(input);
  cmd.args(["-frames:v", "1", "-q:v", "3"]);
  cmd.arg(output);
  run_ffmpeg(cmd)
}

/// 视频首帧直接进内存（管道 JPEG），供宫格 WebP，不落临时海报文件
pub fn decode_video_poster(ffmpeg: &Path, input: &Path) -> Option<image::DynamicImage> {
  let mut cmd = Command::new(ffmpeg);
  cmd.args([
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-threads",
    "2",
    "-y",
    "-ss",
    "0",
    "-i",
  ]);
  cmd.arg(input);
  cmd.args([
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-c:v",
    "mjpeg",
    "-q:v",
    "3",
    "pipe:1",
  ]);
  let (ok, bytes) = run_ffmpeg_capturing(cmd, FFMPEG_TIMEOUT);
  if !ok || bytes.is_empty() {
    return None;
  }
  image::load_from_memory(&bytes).ok()
}

/// ffmpeg 子进程超时上限（秒）：大视频首帧 / 大 HEIC 解码通常数秒内完成，60s 兜底损坏文件卡死
pub const FFMPEG_TIMEOUT_SECS: u64 = 60;
const FFMPEG_TIMEOUT: Duration = Duration::from_secs(FFMPEG_TIMEOUT_SECS);

fn run_ffmpeg(cmd: Command) -> bool {
  run_ffmpeg_with_timeout(cmd, FFMPEG_TIMEOUT)
}

fn run_ffmpeg_with_timeout(cmd: Command, timeout: Duration) -> bool {
  run_ffmpeg_capturing(cmd, timeout).0
}

/// 运行 ffmpeg 子进程：带超时与 stderr 捕获；`stdout` 供管道解码
/// 失败 / 超时均记录日志，便于定位损坏文件与环境问题
fn run_ffmpeg_capturing(mut cmd: Command, timeout: Duration) -> (bool, Vec<u8>) {
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
      return (false, Vec::new());
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
    buf
  });

  let start = Instant::now();
  let status = loop {
    match child.try_wait() {
      Ok(Some(status)) => break status,
      Ok(None) => {
        if start.elapsed() >= timeout {
          let _ = child.kill();
          let _ = stdout_handle.join();
          let err = stderr_handle.join().unwrap_or_default();
          log::warn!(
            "album: ffmpeg 超时({}s) 已终止；stderr: {}",
            timeout.as_secs(),
            String::from_utf8_lossy(&err).trim()
          );
          return (false, Vec::new());
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
        return (false, Vec::new());
      }
    }
  };

  let stdout_bytes = stdout_handle.join().unwrap_or_default();
  let err = stderr_handle.join().unwrap_or_default();
  if !status.success() {
    log::warn!(
      "album: ffmpeg 退出码 {:?}；stderr: {}",
      status.code(),
      String::from_utf8_lossy(&err).trim()
    );
  }
  (status.success(), stdout_bytes)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn needs_playback_transcode_hevc_variants() {
    assert!(needs_playback_transcode("hevc"));
    assert!(needs_playback_transcode("HEVC"));
    assert!(needs_playback_transcode("h265"));
    assert!(needs_playback_transcode("hev1"));
    assert!(!needs_playback_transcode("h264"));
    assert!(!needs_playback_transcode("vp9"));
  }

  #[test]
  fn parse_stream_info_with_duration() {
    let out = "codec_name=hevc\r\nwidth=1920\r\nheight=1080\r\nduration=12.345678\r\n";
    let info = parse_video_stream_info(out).expect("parsed");
    assert_eq!(info.codec.as_deref(), Some("hevc"));
    assert_eq!(info.width, Some(1920));
    assert_eq!(info.height, Some(1080));
    assert_eq!(info.duration_ms, Some(12_346));
  }

  #[test]
  fn parse_stream_info_duration_na() {
    let info = parse_video_stream_info("codec_name=h264\nwidth=640\nheight=480\nduration=N/A\n")
      .expect("parsed");
    assert_eq!(info.duration_ms, None);
    assert!(parse_video_stream_info("").is_none());
  }

  #[test]
  fn prefer_playback_proxy_mov_only() {
    assert!(prefer_playback_proxy("mov"));
    assert!(!prefer_playback_proxy("mp4"));
  }

  #[test]
  fn playback_filter_caps_edge_without_raising_crf() {
    let vf = playback_video_filter();
    assert!(vf.contains("3840"));
    assert!(vf.contains("yuv420p"));
    assert!(vf.contains("force_original_aspect_ratio=decrease"));
  }

  /// 有捆绑 ffmpeg 时：带 max_side 的栅格解码须缩到边长上限内
  #[test]
  fn decode_raster_via_ffmpeg_respects_max_side() {
    let ffmpeg = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("resources")
      .join("ffmpeg.exe");
    if !ffmpeg.is_file() {
      return;
    }
    let base = std::env::temp_dir().join(format!(
      "album_ffmpeg_scale_{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
    ));
    let _ = std::fs::create_dir_all(&base);
    let src = base.join("wide.png");
    // 800×400：无 scale 时远大于 64
    image::RgbImage::new(800, 400)
      .save(&src)
      .expect("write png");
    let img = decode_raster_via_ffmpeg(&ffmpeg, &src, Some(64)).expect("ffmpeg scale decode");
    assert!(img.width() <= 64);
    assert!(img.height() <= 64);
    let _ = std::fs::remove_dir_all(&base);
  }
}

fn temp_jpeg_path() -> PathBuf {
  use std::time::{SystemTime, UNIX_EPOCH};
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_nanos())
    .unwrap_or(0);
  std::env::temp_dir().join(format!("album_ffmpeg_{nanos}.jpg"))
}
