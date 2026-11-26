//! Apple ID 密码凭据存取（按账号分槽）
//! 职责：优先 OS keyring；不可用时回退 `icloud-sync-password.{stem}.local`
//! 适用：「记住我」且登录成功后写入；旧版单槽密码不迁移，用户重新登录即可

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use tauri::AppHandle;

use super::account_book::remember_enabled_for;
use super::settings::{apple_id_session_stem, icloud_sync_dir};

const SERVICE: &str = "com.ll.admin.icloud-sync";

fn entry_for_user(user: &str) -> Result<Entry, String> {
  Entry::new(SERVICE, user).map_err(|e| format!("打开凭据库失败: {e}"))
}

fn fallback_path_for_stem(app: &AppHandle, stem: &str) -> Result<PathBuf, String> {
  let base = icloud_sync_dir(app)?;
  Ok(base.join(format!("icloud-sync-password.{stem}.local")))
}

fn read_fallback_file(path: &PathBuf) -> Result<Option<String>, String> {
  if !path.exists() {
    return Ok(None);
  }
  let raw = fs::read_to_string(path).map_err(|e| format!("读取本地密码回退文件失败: {e}"))?;
  let password = raw.trim().to_string();
  if password.is_empty() {
    Ok(None)
  } else {
    Ok(Some(password))
  }
}

fn write_fallback_file(path: &PathBuf, password: &str) -> Result<(), String> {
  let password = password.trim();
  if password.is_empty() {
    if path.exists() {
      match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("删除本地密码回退文件失败: {e}")),
      }
    } else {
      Ok(())
    }
  } else {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
    }
    fs::write(path, password).map_err(|e| format!("写入本地密码回退文件失败: {e}"))
  }
}

fn get_password_for_user(_app: &AppHandle, user: &str, fallback: &PathBuf) -> Result<Option<String>, String> {
  match entry_for_user(user) {
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
  read_fallback_file(fallback)
}

fn set_password_for_user(app: &AppHandle, user: &str, fallback: &PathBuf, password: &str) -> Result<(), String> {
  let password = password.trim();
  let mut keyring_err: Option<String> = None;

  match entry_for_user(user) {
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

  write_fallback_file(fallback, password)?;

  let stored = get_password_for_user(app, user, fallback)?;
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

fn keyring_user_for_apple_id(apple_id: &str) -> String {
  apple_id_session_stem(apple_id)
}

fn read_account_slot(app: &AppHandle, apple_id: &str) -> Result<Option<String>, String> {
  let user = keyring_user_for_apple_id(apple_id);
  let fallback = fallback_path_for_stem(app, &user)?;
  get_password_for_user(app, &user, &fallback)
}

/// 指定账号是否已配置非空密码（须 remember 开启）
pub fn has_password_for_apple_id(app: &AppHandle, apple_id: &str) -> Result<bool, String> {
  let apple_id = apple_id.trim();
  if apple_id.is_empty() {
    return Ok(false);
  }
  if !remember_enabled_for(app, apple_id)? {
    return Ok(false);
  }
  Ok(read_account_slot(app, apple_id)?.is_some())
}

/// 读取某账号密码；未记住或未设置时返回 None
pub fn get_password(app: &AppHandle, apple_id: &str) -> Result<Option<String>, String> {
  let apple_id = apple_id.trim();
  if apple_id.is_empty() {
    return Ok(None);
  }
  if !remember_enabled_for(app, apple_id)? {
    return Ok(None);
  }
  read_account_slot(app, apple_id)
}

/// 写入或清空某账号密码（空字符串时删除）
pub fn set_password(app: &AppHandle, apple_id: &str, password: &str) -> Result<(), String> {
  let apple_id = apple_id.trim();
  if apple_id.is_empty() {
    return Err("Apple ID 不能为空".into());
  }
  let user = keyring_user_for_apple_id(apple_id);
  let fallback = fallback_path_for_stem(app, &user)?;
  set_password_for_user(app, &user, &fallback, password)
}

/// 删除某账号密码槽（取消「记住我」时）
pub fn delete_password(app: &AppHandle, apple_id: &str) -> Result<(), String> {
  set_password(app, apple_id, "")
}