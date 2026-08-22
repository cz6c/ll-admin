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
use settings::{
  clear_session_for_apple_id, consent_ready, load_settings, normalize_icloud_domain, require_consent,
  save_settings, session_has_files, session_has_files_for_apple_id,
};
use sidecar::{session_dir, SidecarClient, SidecarEvent, SIDECAR_PROTOCOL};
use types::IcloudSyncSettings;

static SIDECAR_PING: Mutex<()> = Mutex::new(());

/// 确保 sidecar 已认证（内存态或 session 目录恢复）。
/// 适用：start_job / resume 下载前；sidecar 进程重启后 login 页内存态会丢失。
/// @note 仅 auth_probe 恢复 session，禁止携带密码重登（设计铁律：auth 仅用户显式触发）。
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

  let session_path = session_dir(app)?;

  client.ensure_started(app).map_err(|e| e.to_string())?;

  let event = client
    .request(
      app,
      serde_json::json!({
        "cmd": "auth_probe",
        "apple_id": apple_id,
        "session_dir": session_path.to_string_lossy(),
        "icloud_domain": normalize_icloud_domain(&settings.icloud_domain),
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
        .unwrap_or_else(|| types::error_codes::SESSION_EXPIRED.to_string());
      let message = event.message.unwrap_or_default();
      if message.is_empty() {
        Err(code)
      } else {
        Err(format!("{code}: {message}"))
      }
    }
    other => Err(format!("auth_probe 意外响应: type={other}")),
  }
}

/// `icloud_sync_login` / `icloud_sync_submit_2fa` 成功时的状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncLoginResult {
  /// `need_2fa` / `ok` / `error`
  pub status: String,
  /// pyicloud 2FA 投递方式：`sms` / `trusted_device` 等
  #[serde(skip_serializing_if = "Option::is_none")]
  pub delivery_method: Option<String>,
  /// 面向用户的 2FA 引导或错误摘要
  #[serde(skip_serializing_if = "Option::is_none")]
  pub detail: Option<String>,
  /// 机读错误码（status=error 时）
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_code: Option<String>,
  /// sidecar 输出的完整诊断（flags/hints/userActions 等）
  #[serde(skip_serializing_if = "Option::is_none")]
  pub diagnostic: Option<serde_json::Value>,
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
  pub icloud_domain: String,
  pub consent_ready: bool,
  /// session 目录是否有落盘文件；不保证仍有效
  pub session_present: bool,
  /// 当前 Apple ID 是否已有专属 session 文件
  pub session_for_current_apple_id: bool,
  /// 是否处于已登录态（有当前账号 session；须 logout 后才能再次 login）
  pub logged_in: bool,
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

/// 清空 sidecar 进程内认证态；logout / 换号前调用
/// @note 旧 bundled exe 不支持 logout 时会重启 sidecar 并重试一次
pub(crate) fn reset_sidecar_auth(app: &AppHandle, client: &SidecarClient) -> Result<(), String> {
  fn send_logout(app: &AppHandle, client: &SidecarClient) -> Result<(), String> {
    client.ensure_started(app).map_err(|e| e.to_string())?;
    let event = client
      .request(
        app,
        serde_json::json!({
          "cmd": "logout",
        }),
      )
      .map_err(|e| e.to_string())?;

    match event.event_type.as_str() {
      "done" => Ok(()),
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
      other => Err(format!("logout 意外响应: type={other}")),
    }
  }

  match send_logout(app, client) {
    Ok(()) => Ok(()),
    Err(e)
      if e.contains("unknown cmd")
        || (e.contains("invalid_request") && e.contains("logout")) =>
    {
      log::warn!("icloud sidecar logout unsupported, restarting sidecar: {e}");
      client.stop().map_err(|err| err.to_string())?;
      send_logout(app, client)
    }
    Err(e) => Err(e),
  }
}

/// 保存 Apple ID（settings.json）与密码（keyring/回退文件）；密码不进 SQLite
/// @note Apple ID 变更时会 reset sidecar 并清除旧账号 session，避免误复用
#[tauri::command]
pub fn icloud_sync_set_credentials(
  app: AppHandle,
  apple_id: String,
  password: String,
  sidecar: State<'_, SidecarClientHandle>,
) -> Result<bool, String> {
  let apple_id = apple_id.trim().to_string();
  if apple_id.is_empty() {
    return Err("Apple ID 不能为空".to_string());
  }
  let mut settings = load_settings(&app)?;
  let previous = settings.apple_id.trim().to_string();
  let account_changed = !previous.is_empty() && previous != apple_id;
  settings.apple_id = apple_id.clone();
  save_settings(&app, &settings)?;
  keyring_store::set_password(&app, &password)?;
  if account_changed {
    let _ = reset_sidecar_auth(&app, sidecar.client().as_ref());
    clear_session_for_apple_id(&app, &previous)?;
  }
  Ok(account_changed)
}

/// 登出：清 sidecar 内存态 + 当前账号 session 文件；保留 settings 中的 Apple ID
#[tauri::command]
pub fn icloud_sync_logout(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
  clear_session: Option<bool>,
) -> Result<(), String> {
  reset_sidecar_auth(&app, sidecar.client().as_ref())?;
  if clear_session.unwrap_or(true) {
    let settings = load_settings(&app)?;
    clear_session_for_apple_id(&app, &settings.apple_id)?;
  }
  Ok(())
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

  if session_has_files_for_apple_id(&app, &apple_id)? {
    return Err(format!(
      "{}: 请先退出当前登录后再重新登录",
      types::error_codes::ALREADY_LOGGED_IN
    ));
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
        "icloud_domain": normalize_icloud_domain(&settings.icloud_domain),
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

/// 读取 sidecar 最近一次认证诊断（不触发登录、不消耗 Apple 配额）
#[tauri::command]
pub fn icloud_sync_get_auth_diagnostic(
  app: AppHandle,
  sidecar: State<'_, SidecarClientHandle>,
) -> Result<IcloudSyncLoginResult, String> {
  let settings = load_settings(&app)?;
  let session_path = session_dir(&app)?;
  let client = sidecar.client();
  client.ensure_started(&app).map_err(|e| e.to_string())?;

  let event = client
    .request(
      &app,
      serde_json::json!({
        "cmd": "auth_diagnostic",
        "session_dir": session_path.to_string_lossy(),
        "apple_id": settings.apple_id.trim(),
      }),
    )
    .map_err(|e| e.to_string())?;

  match event.event_type.as_str() {
    "done" => Ok(IcloudSyncLoginResult {
      status: "diagnostic".to_string(),
      delivery_method: None,
      detail: None,
      error_code: None,
      diagnostic: diagnostic_from_event(&event),
    }),
    "error" => {
      let code = event
        .code
        .unwrap_or_else(|| types::error_codes::AUTH_FAILED.to_string());
      Err(format!("{code}: {}", event.message.unwrap_or_default()))
    }
    other => Err(format!("auth_diagnostic 意外响应: type={other}")),
  }
}

/// 读取 auth 页所需 consent / 凭据 / session 概况（不含密码明文）
#[tauri::command]
pub fn icloud_sync_auth_state(app: AppHandle) -> Result<IcloudSyncAuthStateResult, String> {
  let settings = load_settings(&app)?;
  let session_for_current =
    session_has_files_for_apple_id(&app, &settings.apple_id)?;
  Ok(IcloudSyncAuthStateResult {
    apple_id: settings.apple_id.clone(),
    has_password: keyring_store::has_password(&app)?,
    risk_accepted: settings.risk_accepted,
    checklist_web_access: settings.checklist_web_access,
    checklist_adp_off: settings.checklist_adp_off,
    icloud_domain: normalize_icloud_domain(&settings.icloud_domain),
    consent_ready: consent_ready(&settings),
    session_present: session_has_files(&app)?,
    session_for_current_apple_id: session_for_current,
    logged_in: session_for_current,
  })
}

fn diagnostic_from_event(event: &SidecarEvent) -> Option<serde_json::Value> {
  event.extra.get("diagnostic").cloned()
}

fn map_login_event(event: SidecarEvent) -> Result<IcloudSyncLoginResult, String> {
  let delivery_method = event
    .extra
    .get("delivery_method")
    .and_then(|v| v.as_str())
    .map(str::to_string)
    .or_else(|| {
      event
        .extra
        .get("deliveryMethod")
        .and_then(|v| v.as_str())
        .map(str::to_string)
    });
  let detail = event.detail.clone().or_else(|| event.message.clone());
  let diagnostic = diagnostic_from_event(&event);

  match event.event_type.as_str() {
    "need_2fa" => Ok(IcloudSyncLoginResult {
      status: "need_2fa".to_string(),
      delivery_method,
      detail,
      error_code: None,
      diagnostic,
    }),
    "done" => Ok(IcloudSyncLoginResult {
      status: "ok".to_string(),
      delivery_method: None,
      detail: None,
      error_code: None,
      diagnostic: None,
    }),
    "error" => {
      let code = event
        .code
        .unwrap_or_else(|| types::error_codes::AUTH_FAILED.to_string());
      let message = event.message.unwrap_or_default();
      Ok(IcloudSyncLoginResult {
        status: "error".to_string(),
        delivery_method: None,
        detail: if message.is_empty() {
          None
        } else {
          Some(message)
        },
        error_code: Some(code),
        diagnostic,
      })
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
  fn map_login_event_error_with_diagnostic() {
    let mut extra = std::collections::HashMap::new();
    extra.insert(
      "diagnostic".to_string(),
      serde_json::json!({"hints": ["WEBAUTH_MISSING_AFTER_2FA"]}),
    );
    let event = SidecarEvent {
      event_type: "error".to_string(),
      cmd: Some("auth_2fa".to_string()),
      protocol: None,
      agent: None,
      code: Some(error_codes::AUTH_FAILED.to_string()),
      message: Some("session not ready".to_string()),
      detail: None,
      step: None,
      items: None,
      extra,
    };
    let result = map_login_event(event).expect("structured error");
    assert_eq!(result.status, "error");
    assert_eq!(result.error_code.as_deref(), Some(error_codes::AUTH_FAILED));
    assert!(result.diagnostic.is_some());
  }

  #[test]
  fn map_login_event_error_legacy() {
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
    let result = map_login_event(event).expect("structured error");
    assert_eq!(result.status, "error");
    assert_eq!(result.error_code.as_deref(), Some(error_codes::AUTH_FAILED));
    assert_eq!(result.detail.as_deref(), Some("bad credentials"));
  }
}
