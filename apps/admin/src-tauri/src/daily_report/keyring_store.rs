//! AI API Key 凭据存取
//! 职责：优先 OS keyring；Windows 等环境下 keyring 不可用时回退到应用数据目录文件
//! 适用：应用设置写入、流水线调模型前读取
//!
//! @note keyring 3 须启用 windows-native 等 feature，否则无真实凭据后端，会出现
//! 「保存后本页显示已配置、切走再回来又未配置」——因从未真正落盘。

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use tauri::{AppHandle, Manager};

const SERVICE: &str = "com.ll.admin.daily-report";
const USER: &str = "api-key";
/// 回退文件名（仅本机 app_data，权限随用户目录）
const FALLBACK_FILE: &str = "ai-api-key.local";

fn entry() -> Result<Entry, String> {
  Entry::new(SERVICE, USER).map_err(|e| format!("打开凭据库失败: {e}"))
}

fn fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  fs::create_dir_all(&base).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
  Ok(base.join(FALLBACK_FILE))
}

fn read_fallback(app: &AppHandle) -> Result<Option<String>, String> {
  let path = fallback_path(app)?;
  if !path.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取本地 Key 回退文件失败: {e}"))?;
  let key = raw.trim().to_string();
  if key.is_empty() {
    Ok(None)
  } else {
    Ok(Some(key))
  }
}

fn write_fallback(app: &AppHandle, key: &str) -> Result<(), String> {
  let path = fallback_path(app)?;
  if key.is_empty() {
    match fs::remove_file(&path) {
      Ok(()) => Ok(()),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
      Err(e) => Err(format!("删除本地 Key 回退文件失败: {e}")),
    }
  } else {
    fs::write(&path, key).map_err(|e| format!("写入本地 Key 回退文件失败: {e}"))
  }
}

/// 是否已配置非空 Key（钥匙串或回退文件）
pub fn has_api_key(app: &AppHandle) -> Result<bool, String> {
  Ok(get_api_key(app)?.is_some())
}

/// 读取 Key；未设置时返回 None
pub fn get_api_key(app: &AppHandle) -> Result<Option<String>, String> {
  match entry() {
    Ok(entry) => match entry.get_password() {
      Ok(p) if !p.is_empty() => return Ok(Some(p)),
      Ok(_) | Err(keyring::Error::NoEntry) => {}
      Err(e) => {
        log::warn!("keyring 读取失败，尝试回退文件: {e}");
      }
    },
    Err(e) => {
      log::warn!("打开 keyring 失败，尝试回退文件: {e}");
    }
  }
  read_fallback(app)
}

/// 写入或清空 Key（空字符串时删除）
/// @note 同时写钥匙串与回退文件；钥匙串失败不阻断回退文件，保证切页后仍可读回
pub fn set_api_key(app: &AppHandle, key: &str) -> Result<(), String> {
  let key = key.trim();
  let mut keyring_err: Option<String> = None;

  match entry() {
    Ok(entry) => {
      let kr = if key.is_empty() {
        match entry.delete_credential() {
          Ok(()) => Ok(()),
          Err(keyring::Error::NoEntry) => Ok(()),
          Err(e) => Err(format!("删除 API Key 失败: {e}")),
        }
      } else {
        entry
          .set_password(key)
          .map_err(|e| format!("写入 API Key 失败: {e}"))
      };
      if let Err(e) = kr {
        keyring_err = Some(e);
      }
    }
    Err(e) => {
      keyring_err = Some(e);
    }
  }

  write_fallback(app, key)?;

  // 读回校验，避免「写成功假象」
  let stored = get_api_key(app)?;
  if key.is_empty() {
    if stored.is_some() {
      return Err("清空 API Key 后仍能读到旧值".into());
    }
  } else if stored.as_deref() != Some(key) {
    let hint = keyring_err
      .map(|e| format!("（钥匙串: {e}）"))
      .unwrap_or_default();
    return Err(format!("API Key 写入后无法读回{hint}"));
  } else if let Some(e) = keyring_err {
    log::warn!("API Key 已写入回退文件，钥匙串不可用: {e}");
  }

  Ok(())
}
