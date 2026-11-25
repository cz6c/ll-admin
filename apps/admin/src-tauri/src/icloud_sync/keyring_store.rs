//! Apple ID 密码凭据存取（按账号分槽）
//! 职责：优先 OS keyring；不可用时回退应用数据目录按 stem 分文件
//! 适用：仅「记住我」勾选且登录成功后写入；下次选中该账号时回填
//!
//! @note 登录 SRP 的密码由 `icloud_sync_login(password)` 直传 sidecar，不经本模块
//! @note 明文回填经 `get_password(apple_id)`，且账号须在该号开启 remember
//! @note 未勾选记住我不读写该账号槽位
//! @note SERVICE 与 AI API Key 隔离；禁止写入日志 / settings.json / SQLite

use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use tauri::{AppHandle, Manager};

use super::account_book::remember_enabled_for;
use super::settings::{apple_id_session_stem, icloud_sync_dir, load_settings};

const SERVICE: &str = "com.ll.admin.icloud-sync";
/// 旧版单槽 user；读后迁移到当前 settings.apple_id 对应槽
const LEGACY_USER: &str = "password";
const LEGACY_FALLBACK_FILE: &str = "icloud-sync-password.local";

fn entry_for_user(user: &str) -> Result<Entry, String> {
  Entry::new(SERVICE, user).map_err(|e| format!("打开凭据库失败: {e}"))
}

fn fallback_path_for_stem(app: &AppHandle, stem: &str) -> Result<PathBuf, String> {
  let base = icloud_sync_dir(app)?;
  Ok(base.join(format!("icloud-sync-password.{stem}.local")))
}

fn legacy_fallback_path(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
  Ok(base.join(LEGACY_FALLBACK_FILE))
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

/// 将旧版单槽密码迁移到指定 Apple ID 槽（一次性）
fn migrate_legacy_password(app: &AppHandle, apple_id: &str) -> Result<(), String> {
  let legacy = get_password_for_user(app, LEGACY_USER, &legacy_fallback_path(app)?)?;
  let Some(password) = legacy else {
    return Ok(());
  };
  let stem = apple_id_session_stem(apple_id);
  let user = format!("pwd:{stem}");
  let fallback = fallback_path_for_stem(app, &stem)?;
  if get_password_for_user(app, &user, &fallback)?.is_some() {
    let _ = set_password_for_user(app, LEGACY_USER, &legacy_fallback_path(app)?, "");
    return Ok(());
  }
  set_password_for_user(app, &user, &fallback, &password)?;
  let _ = set_password_for_user(app, LEGACY_USER, &legacy_fallback_path(app)?, "");
  log::info!("icloud keyring: migrated legacy password slot to account stem");
  Ok(())
}

fn keyring_user_for_apple_id(apple_id: &str) -> String {
  format!("pwd:{}", apple_id_session_stem(apple_id))
}

/// 指定账号是否已在钥匙串/回退文件中有密码
pub fn has_password_for_apple_id(app: &AppHandle, apple_id: &str) -> Result<bool, String> {
  let apple_id = apple_id.trim();
  if apple_id.is_empty() {
    return Ok(false);
  }
  Ok(get_password(app, apple_id)?.is_some())
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

  let settings = load_settings(app)?;
  if settings.apple_id.trim().eq_ignore_ascii_case(apple_id) {
    migrate_legacy_password(app, apple_id)?;
  }

  let user = keyring_user_for_apple_id(apple_id);
  let fallback = fallback_path_for_stem(app, &apple_id_session_stem(apple_id))?;
  get_password_for_user(app, &user, &fallback)
}

/// 写入或清空某账号密码（空字符串时删除）
pub fn set_password(app: &AppHandle, apple_id: &str, password: &str) -> Result<(), String> {
  let apple_id = apple_id.trim();
  if apple_id.is_empty() {
    return Err("Apple ID 不能为空".into());
  }
  let user = keyring_user_for_apple_id(apple_id);
  let fallback = fallback_path_for_stem(app, &apple_id_session_stem(apple_id))?;
  set_password_for_user(app, &user, &fallback, password)
}

/// 删除某账号密码槽（取消「记住我」时）
pub fn delete_password(app: &AppHandle, apple_id: &str) -> Result<(), String> {
  set_password(app, apple_id, "")
}