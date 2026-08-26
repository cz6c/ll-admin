//! Apple ID 密码凭据存取
//! 职责：优先 OS keyring；Windows 等环境下 keyring 不可用时回退到应用数据目录文件
//! 适用：iCloud 登录前读取、auth 命令写入
//!
//! @note 密码仅在此模块与 sidecar 内存传输；不进 SQLite、不进 settings.json、禁止写入日志
//! @note SERVICE 与 AI API Key 隔离，避免凭据混用

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use tauri::{AppHandle, Manager};

const SERVICE: &str = "com.ll.admin.icloud-sync";
const USER: &str = "password";
/// 回退文件名（仅本机 app_data，权限随用户目录）
const FALLBACK_FILE: &str = "icloud-sync-password.local";

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
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取本地密码回退文件失败: {e}"))?;
  let password = raw.trim().to_string();
  if password.is_empty() {
    Ok(None)
  } else {
    Ok(Some(password))
  }
}

fn write_fallback(app: &AppHandle, password: &str) -> Result<(), String> {
  let path = fallback_path(app)?;
  if password.is_empty() {
    match fs::remove_file(&path) {
      Ok(()) => Ok(()),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
      Err(e) => Err(format!("删除本地密码回退文件失败: {e}")),
    }
  } else {
    fs::write(&path, password).map_err(|e| format!("写入本地密码回退文件失败: {e}"))
  }
}

/// 是否已配置非空密码（钥匙串或回退文件）
pub fn has_password(app: &AppHandle) -> Result<bool, String> {
  Ok(get_password(app)?.is_some())
}

/// 读取密码；未设置时返回 None
pub fn get_password(app: &AppHandle) -> Result<Option<String>, String> {
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

/// 写入或清空密码（空字符串时删除）
/// @note 同时写钥匙串与回退文件；钥匙串失败不阻断回退文件，保证切页后仍可读回
pub fn set_password(app: &AppHandle, password: &str) -> Result<(), String> {
  let password = password.trim();
  let mut keyring_err: Option<String> = None;

  match entry() {
    Ok(entry) => {
      let kr = if password.is_empty() {
        match entry.delete_credential() {
          Ok(()) => Ok(()),
          Err(keyring::Error::NoEntry) => Ok(()),
          Err(e) => Err(format!("删除 Apple ID 密码失败: {e}")),
        }
      } else {
        entry
          .set_password(password)
          .map_err(|e| format!("写入 Apple ID 密码失败: {e}"))
      };
      if let Err(e) = kr {
        keyring_err = Some(e);
      }
    }
    Err(e) => {
      keyring_err = Some(e);
    }
  }

  write_fallback(app, password)?;

  let stored = get_password(app)?;
  if password.is_empty() {
    if stored.is_some() {
      return Err("清空密码后仍能读到旧值".into());
    }
  } else if stored.as_deref() != Some(password) {
    let hint = keyring_err
      .map(|e| format!("（钥匙串: {e}）"))
      .unwrap_or_default();
    return Err(format!("密码写入后无法读回{hint}"));
  } else if let Some(e) = keyring_err {
    log::warn!("密码已写入回退文件，钥匙串不可用: {e}");
  }

  Ok(())
}
