//! 本地文件删除策略
//! 职责：原媒体进系统回收站；缩略图等派生缓存永久删除
//! 适用：`album_delete_local`

use std::path::Path;

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
