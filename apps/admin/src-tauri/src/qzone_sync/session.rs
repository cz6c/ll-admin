//! QQ 空间会话持久化
//! 职责：落盘 / 读取 / 清除 session.json；g_tk 计算
//! 适用：扫码成功后的会话；HTTP 客户端鉴权

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use super::settings::qzone_sync_dir;
use super::types::QzoneSession;

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(qzone_sync_dir(app)?.join("session.json"))
}

pub fn save_session(app: &AppHandle, session: &QzoneSession) -> Result<(), String> {
  let path = session_path(app)?;
  let raw =
    serde_json::to_string_pretty(session).map_err(|e| format!("序列化会话失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入会话失败: {e}"))
}

pub fn load_session(app: &AppHandle) -> Result<Option<QzoneSession>, String> {
  let path = session_path(app)?;
  if !path.is_file() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取会话失败: {e}"))?;
  let session: QzoneSession =
    serde_json::from_str(&raw).map_err(|e| format!("解析会话失败: {e}"))?;
  if session.uin.is_empty() || session.p_skey.is_empty() {
    return Ok(None);
  }
  Ok(Some(session))
}

pub fn clear_session(app: &AppHandle) -> Result<(), String> {
  let path = session_path(app)?;
  if path.is_file() {
    fs::remove_file(&path).map_err(|e| format!("删除会话失败: {e}"))?;
  }
  Ok(())
}

/// 由 p_skey 计算 g_tk（空间 Web 鉴权参数）
pub fn calc_g_tk(p_skey: &str) -> i64 {
  let mut hash: i64 = 5381;
  for b in p_skey.bytes() {
    hash = hash.wrapping_add((hash << 5).wrapping_add(b as i64));
  }
  hash & 0x7fff_ffff
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn gtk_positive() {
    assert!(calc_g_tk("abcXYZ") > 0);
  }
}
