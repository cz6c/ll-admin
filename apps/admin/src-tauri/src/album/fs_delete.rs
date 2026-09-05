//! 本地文件删除策略
//! 职责：原媒体进系统回收站；缩略图等派生缓存永久删除
//! 适用：`album_delete_local`、discover 同步索引时清孤儿缓存

use std::path::{Path, PathBuf};

use super::thumbnail;
use super::types::ALBUM_CACHE_VERSION;

/// 原媒体移入系统回收站（可还原）；失败时回退永久删除并打日志
pub fn trash_original_file(path: &Path) -> Result<(), String> {
  if !path.is_file() {
    return Ok(());
  }
  match move_to_recycle_bin(path) {
    Ok(()) => Ok(()),
    Err(e) => {
      // 某些网络盘/权限场景回收站不可用；回退永久删，避免清理流程卡死
      log::warn!("移入回收站失败，改为永久删除 {}: {e}", path.display());
      std::fs::remove_file(path)
        .map_err(|err| format!("删除文件失败 {}: {err}", path.display()))
    }
  }
}

/// 缓存文件永久删除（缩略图/预览/播放代理，不进回收站）
pub fn purge_cache_file(path: &Path) {
  if path.is_file() {
    let _ = std::fs::remove_file(path);
  }
}

fn push_unique(to: &mut Vec<PathBuf>, path: PathBuf) {
  if !to.iter().any(|x| x == &path) {
    to.push(path);
  }
}

/// 附上 DB 记录的 playback 与磁盘探测到的 `_play.mp4`
fn append_playback_caches(
  to_remove: &mut Vec<PathBuf>,
  album_data_dir: &Path,
  source_path: &str,
  db_playback: Option<&str>,
) {
  if let Some(p) = db_playback.map(str::trim).filter(|s| !s.is_empty()) {
    push_unique(to_remove, PathBuf::from(p));
  }
  let cache_dir = album_data_dir
    .join("thumbs")
    .join(format!("v{ALBUM_CACHE_VERSION}"));
  if let Some(derived) = thumbnail::probe_playback_cache(&cache_dir, source_path) {
    push_unique(to_remove, PathBuf::from(derived));
  }
}

/**
 * 收集应永久删除的派生缓存（不含原图 / Live mov）
 * @note 小图复用原路径作 thumb 时会被 originals 过滤，避免误删
 */
pub fn collect_derived_cache_paths(
  album_data_dir: &Path,
  media_path: &str,
  thumb: Option<&str>,
  preview: Option<&str>,
  video_path: Option<&str>,
  playback: Option<&str>,
) -> Vec<PathBuf> {
  let media_path = media_path.trim();
  let mut originals: Vec<PathBuf> = vec![PathBuf::from(media_path)];
  let video = video_path
    .map(str::trim)
    .filter(|s| !s.is_empty() && *s != media_path);
  if let Some(v) = video {
    originals.push(PathBuf::from(v));
  }

  let mut caches: Vec<PathBuf> = Vec::new();
  for p in [thumb, preview, playback].into_iter().flatten() {
    let p = p.trim();
    if p.is_empty() {
      continue;
    }
    let pb = PathBuf::from(p);
    if originals.iter().any(|o| o == &pb) {
      continue;
    }
    push_unique(&mut caches, pb);
  }

  if let Some(v) = video {
    append_playback_caches(&mut caches, album_data_dir, v, None);
  }
  append_playback_caches(&mut caches, album_data_dir, media_path, None);

  // 上面 probe 可能与 playback 参数重复；playback 已在首轮加入
  // 再探测一次无害（push_unique）
  caches
}

/// 批量永久删除派生缓存文件
pub fn purge_derived_cache_paths(paths: &[PathBuf]) {
  for p in paths {
    purge_cache_file(p);
  }
}

#[cfg(windows)]
fn move_to_recycle_bin(path: &Path) -> Result<(), String> {
  use std::os::windows::ffi::OsStrExt;
  use windows::core::PCWSTR;
  use windows::Win32::UI::Shell::{
    SHFileOperationW, FO_DELETE, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
    SHFILEOPSTRUCTW,
  };

  // SHFileOperation 要求 pFrom 为双 NUL 结尾的路径列表
  let mut from: Vec<u16> = path.as_os_str().encode_wide().collect();
  from.push(0);
  from.push(0);

  let flags = (FOF_ALLOWUNDO.0 | FOF_NOCONFIRMATION.0 | FOF_NOERRORUI.0 | FOF_SILENT.0) as u16;
  let mut file_op = SHFILEOPSTRUCTW {
    hwnd: Default::default(),
    wFunc: FO_DELETE,
    pFrom: PCWSTR(from.as_ptr()),
    pTo: PCWSTR::null(),
    fFlags: flags,
    fAnyOperationsAborted: false.into(),
    hNameMappings: std::ptr::null_mut(),
    lpszProgressTitle: PCWSTR::null(),
  };

  // SAFETY: from 在本次调用期间保持有效；结构体字段均已初始化
  let code = unsafe { SHFileOperationW(&mut file_op) };
  if code != 0 || file_op.fAnyOperationsAborted.as_bool() {
    return Err(format!(
      "SHFileOperation 失败 code={code} aborted={}",
      file_op.fAnyOperationsAborted.as_bool()
    ));
  }
  Ok(())
}

#[cfg(not(windows))]
fn move_to_recycle_bin(path: &Path) -> Result<(), String> {
  // 非 Windows：无统一回收站 API，退化为永久删除（CS 主目标为 Win）
  std::fs::remove_file(path).map_err(|e| format!("删除文件失败 {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  #[test]
  fn purge_cache_removes_file() {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("album_purge_cache_{nanos}.tmp"));
    std::fs::write(&path, b"cache").expect("write");
    assert!(path.is_file());
    purge_cache_file(&path);
    assert!(!path.is_file());
  }

  #[test]
  fn collect_skips_original_reused_as_thumb() {
    let album = std::env::temp_dir().join("album_collect_skip_orig");
    let media = album.join("a.jpg");
    let paths = collect_derived_cache_paths(
      &album,
      media.to_str().unwrap(),
      Some(media.to_str().unwrap()),
      None,
      None,
      None,
    );
    assert!(paths.is_empty());
  }

  #[cfg(windows)]
  #[test]
  fn trash_original_moves_file_off_disk() {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("album_trash_orig_{nanos}.tmp"));
    std::fs::write(&path, b"original").expect("write");
    assert!(path.is_file());
    trash_original_file(&path).expect("trash");
    assert!(!path.is_file());
  }
}
