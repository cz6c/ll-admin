//! iCloud 登录账号名册（非敏感）
//! 职责：曾用 Apple ID 列表、按账号「记住我」标记、最近使用时间；供登录面板输入建议
//! 适用：与 keyring_store 按账号分槽配合；密码不进本文件

use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::settings::{icloud_sync_dir, load_settings};

/// 名册上限；超出时按 last_used_at 淘汰最旧项
const MAX_ACCOUNTS: usize = 10;

/// 单条账号记录（明文 Apple ID）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountBookEntry {
  pub apple_id: String,
  pub remember_password: bool,
  pub last_used_at: i64,
}

/// `<appData>/icloud-sync/accountBook.json`
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccountBook {
  #[serde(default)]
  pub accounts: Vec<AccountBookEntry>,
}

fn account_book_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(icloud_sync_dir(app)?.join("accountBook.json"))
}

/// 读取名册；不存在时返回空
pub fn load_account_book(app: &AppHandle) -> Result<AccountBook, String> {
  let path = account_book_path(app)?;
  if !path.exists() {
    return Ok(AccountBook::default());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("读取账号名册失败: {e}"))?;
  serde_json::from_str(&raw).map_err(|e| format!("解析账号名册失败: {e}"))
}

fn save_account_book(app: &AppHandle, book: &AccountBook) -> Result<(), String> {
  let path = account_book_path(app)?;
  let raw =
    serde_json::to_string_pretty(book).map_err(|e| format!("序列化账号名册失败: {e}"))?;
  fs::write(&path, raw).map_err(|e| format!("写入账号名册失败: {e}"))
}

fn normalize_apple_id(apple_id: &str) -> String {
  apple_id.trim().to_string()
}

fn index_for(book: &AccountBook, apple_id: &str) -> Option<usize> {
  let want = apple_id.trim().to_lowercase();
  book
    .accounts
    .iter()
    .position(|e| e.apple_id.trim().to_lowercase() == want)
}

/// 登录成功或更新「记住我」后 upsert；超出上限淘汰最旧
pub fn upsert_account(
  app: &AppHandle,
  apple_id: &str,
  remember_password: bool,
) -> Result<AccountBook, String> {
  let apple_id = normalize_apple_id(apple_id);
  if apple_id.is_empty() {
    return Err("Apple ID 不能为空".into());
  }
  let now = Utc::now().timestamp();
  let mut book = load_account_book(app)?;
  if let Some(idx) = index_for(&book, &apple_id) {
    book.accounts[idx].apple_id = apple_id.clone();
    book.accounts[idx].remember_password = remember_password;
    book.accounts[idx].last_used_at = now;
  } else {
    book.accounts.push(AccountBookEntry {
      apple_id: apple_id.clone(),
      remember_password,
      last_used_at: now,
    });
  }
  book.accounts.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
  if book.accounts.len() > MAX_ACCOUNTS {
    book.accounts.truncate(MAX_ACCOUNTS);
  }
  save_account_book(app, &book)?;
  Ok(book)
}

/// 名册是否对该账号启用记住密码（无条目时回退 settings 与当前号一致）
pub fn remember_enabled_for(app: &AppHandle, apple_id: &str) -> Result<bool, String> {
  let apple_id = normalize_apple_id(apple_id);
  if apple_id.is_empty() {
    return Ok(false);
  }
  let book = load_account_book(app)?;
  if let Some(idx) = index_for(&book, &apple_id) {
    return Ok(book.accounts[idx].remember_password);
  }
  let settings = load_settings(app)?;
  Ok(
    settings.remember_password
      && settings.apple_id.trim().eq_ignore_ascii_case(&apple_id),
  )
}

/// 登录面板下拉：合并名册与 settings 当前号，按最近使用排序
pub fn list_accounts_for_ui(app: &AppHandle) -> Result<Vec<AccountBookEntry>, String> {
  let mut book = load_account_book(app)?;
  let settings = load_settings(app)?;
  let current = settings.apple_id.trim();
  if !current.is_empty() && index_for(&book, current).is_none() {
    book.accounts.push(AccountBookEntry {
      apple_id: current.to_string(),
      remember_password: settings.remember_password,
      last_used_at: 0,
    });
  }
  book.accounts.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
  Ok(book.accounts)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn truncate_keeps_newest() {
    let mut book = AccountBook::default();
    for i in 0..12 {
      book.accounts.push(AccountBookEntry {
        apple_id: format!("u{i}@test.com"),
        remember_password: false,
        last_used_at: i as i64,
      });
    }
    book.accounts.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
    book.accounts.truncate(MAX_ACCOUNTS);
    assert_eq!(book.accounts.len(), MAX_ACCOUNTS);
    assert_eq!(book.accounts[0].apple_id, "u11@test.com");
  }
}