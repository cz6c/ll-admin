//! iCloud 照片同步
//! 职责：设置、凭据、SQLite 断点、命名规则、sidecar 队列与 Tauri 命令
//! 适用：admin CS（Tauri）个人工具，不进 Web / server

mod db;
mod keyring_store;
mod naming;
pub mod queue;
mod settings;
mod sidecar;
mod types;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

pub use queue::SidecarClientHandle;
use settings::{consent_ready, load_settings, require_consent, save_settings};
use sidecar::{session_dir, SidecarClient, SidecarEvent, SIDECAR_PROTOCOL};
use types::IcloudSyncSettings;

static SIDECAR_PING: Mutex<()> = Mutex::new(());

/// 确保 sidecar 已认证（内存态或 session 目录恢复）。
/// 适用：start_job / resume 下载前；sidecar 进程重启后 login 页内存态会丢失。
/// @note 使用 keyring 密码 + session_dir 显式 auth；session 失效时返回错误码供 UI 引导重登。
pub(crate) fn ensure_sidecar_authenticated(
  app: &AppHandle,
  client: &SidecarClient,
) -> Result<(), String> {
  let settings = load_settings(app)?;
  require_consent(&settings)?;

  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let password = keyring_store::get_password(app)?
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "请先填写 Apple ID 密码".to_string())?;

  let session_path = session_dir(app)?;

  client.ensure_started(app).map_err(|e| e.to_string())?;

  let event = client
    .request(
      app,
      serde_json::json!({
        "cmd": "auth",
        "apple_id": apple_id,
        "password": password,
        "session_dir": session_path.to_string_lossy(),
      }),
    )
    .map_err(|e| e.to_string())?;

  match event.event_type.as_str() {
    "done" => Ok(()),
    "need_2fa" => Err(format!(
      "{}: 需要二次验证，请前往登录页完成验证",
      types::error_codes::NEED_2FA
    )),
    "error" => {
      let code = event
        .code
        .unwrap_or_else(|| types::error_codes::AUTH_FAILED.to_string());
      let message = event.message.unwrap_or_default();
      if message.is_empty() {
        Err(code)
      } else {
        Err(format!("{code}: {message}"))
      }
    }
    other => Err(format!("auth 意外响应: type={other}")),
  }
}

/// `icloud_sync_login` / `icloud_sync_submit_2fa` 成功时的状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncLoginResult {
  /// `need_2fa`：待二次验证；`ok`：已登录
  pub status: String,
}

/// `icloud_sync_auth_state` 负载：供 auth 页展示 consent 与凭据/session 概况
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncAuthStateResult {
  pub apple_id: String,
  pub has_password: bool,
  pub risk_accepted: bool,
  pub checklist_web_access: bool,
  pub checklist_adp_off: bool,
  pub consent_ready: bool,
  /// session 目录是否有落盘文件；不保证仍有效
  pub session_present: bool,
}

/// `icloud_sync_ping` 成功时的负载
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncPingResult {
  pub protocol: u32,
  pub agent: String,
}

#[tauri::command]
pub fn icloud_sync_get_settings(app: AppHandle) -> Result<IcloudSyncSettings, String> {
  load_settings(&app)
}

#[tauri::command]
pub fn icloud_sync_save_settings(
  app: AppHandle,
  settings: IcloudSyncSettings,
) -> Result<(), String> {
  save_settings(&app, &settings)
}

/// 保存 Apple ID（settings.json）与密码（keyring/回退文件）；密码不进 SQLite
#[tauri::command]
pub fn icloud_sync_set_credentials(
  app: AppHandle,
  apple_id: String,
  password: String,
) -> Result<(), String> {
  let apple_id = apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("Apple ID 不能为空".to_string());
  }
  let mut settings = load_settings(&app)?;
  settings.apple_id = apple_id;
  save_settings(&app, &settings)?;
  keyring_store::set_password(&app, &password)
}

/// 向 sidecar 发起 auth；需 consent 三门禁 + 已存凭据
#[tauri::command]
pub fn icloud_sync_login(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
) -> Result<IcloudSyncLoginResult, String> {
  let settings = load_settings(&app)?;
  require_consent(&settings)?;

  let apple_id = settings.apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("请先填写 Apple ID".to_string());
  }

  let password = keyring_store::get_password(&app)?
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "请先填写 Apple ID 密码".to_string())?;

  let session_path = session_dir(&app)?;
  let client = sidecar.client();
  client.ensure_started(&app).map_err(|e| e.to_string())?;

  let event = client
    .request(
      &app,
      serde_json::json!({
        "cmd": "auth",
        "apple_id": apple_id,
        "password": password,
        "session_dir": session_path.to_string_lossy(),
      }),
    )
    .map_err(|e| e.to_string())?;

  map_login_event(event)
}

/// 提交 2FA 验证码；sidecar 需处于 pending challenge 状态
#[tauri::command]
pub fn icloud_sync_submit_2fa(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
  code: String,
) -> Result<IcloudSyncLoginResult, String> {
  let code = code.trim().to_string();
  if code.is_empty() {
    return Err("验证码不能为空".to_string());
  }

  let client = sidecar.client();
  client.ensure_started(&app).map_err(|e| e.to_string())?;

  let event = client
    .request(
      &app,
      serde_json::json!({
        "cmd": "auth_2fa",
        "code": code,
      }),
    )
    .map_err(|e| e.to_string())?;

  map_login_event(event)
}

/// 读取 auth 页所需 consent / 凭据 / session 概况（不含密码明文）
#[tauri::command]
pub fn icloud_sync_auth_state(app: AppHandle) -> Result<IcloudSyncAuthStateResult, String> {
  let settings = load_settings(&app)?;
  Ok(IcloudSyncAuthStateResult {
    apple_id: settings.apple_id.clone(),
    has_password: keyring_store::has_password(&app)?,
    risk_accepted: settings.risk_accepted,
    checklist_web_access: settings.checklist_web_access,
    checklist_adp_off: settings.checklist_adp_off,
    consent_ready: consent_ready(&settings),
    session_present: settings::session_has_files(&app)?,
  })
}

fn map_login_event(event: SidecarEvent) -> Result<IcloudSyncLoginResult, String> {
  match event.event_type.as_str() {
    "need_2fa" => Ok(IcloudSyncLoginResult {
      status: "need_2fa".to_string(),
    }),
    "done" => Ok(IcloudSyncLoginResult {
      status: "ok".to_string(),
    }),
    "error" => {
      let code = event
        .code
        .unwrap_or_else(|| types::error_codes::AUTH_FAILED.to_string());
      let message = event.message.unwrap_or_default();
      if message.is_empty() {
        Err(code)
      } else {
        Err(format!("{code}: {message}"))
      }
    }
    other => Err(format!("auth 意外响应: type={other}")),
  }
}

/// 启动 sidecar 并返回 agent 版本（开发/冒烟用）
#[tauri::command]
pub fn icloud_sync_ping(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
) -> Result<IcloudSyncPingResult, String> {
  let _guard = SIDECAR_PING
    .lock()
    .map_err(|_| "sidecar ping lock poisoned".to_string())?;
  let client = sidecar.client();
  client.ensure_started(&app).map_err(|e| e.to_string())?;
  Ok(IcloudSyncPingResult {
    protocol: SIDECAR_PROTOCOL,
    agent: client.agent_version().map_err(|e| e.to_string())?,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::icloud_sync::types::error_codes;

  #[test]
  fn map_login_event_need_2fa() {
    let event = SidecarEvent {
      event_type: "need_2fa".to_string(),
      cmd: Some("auth".to_string()),
      protocol: None,
      agent: None,
      code: Some(error_codes::NEED_2FA.to_string()),
      message: None,
      detail: None,
      step: None,
      items: None,
      extra: Default::default(),
    };
    let result = map_login_event(event).expect("need_2fa");
    assert_eq!(result.status, "need_2fa");
  }

  #[test]
  fn map_login_event_done() {
    let event = SidecarEvent {
      event_type: "done".to_string(),
      cmd: Some("auth".to_string()),
      protocol: None,
      agent: None,
      code: None,
      message: None,
      detail: None,
      step: None,
      items: None,
      extra: Default::default(),
    };
    let result = map_login_event(event).expect("ok");
    assert_eq!(result.status, "ok");
  }

  #[test]
  fn map_login_event_error() {
    let event = SidecarEvent {
      event_type: "error".to_string(),
      cmd: Some("auth".to_string()),
      protocol: None,
      agent: None,
      code: Some(error_codes::AUTH_FAILED.to_string()),
      message: Some("bad credentials".to_string()),
      detail: None,
      step: None,
      items: None,
      extra: Default::default(),
    };
    let err = map_login_event(event).unwrap_err();
    assert!(err.contains(error_codes::AUTH_FAILED));
  }
}
