//! iCloud Sync sidecar 进程管理
//! 职责：定位/启动捆绑 exe 或开发 override、line-JSON 单飞请求、启动握手
//! 适用：Task 5 进程层；Task 6 队列在此之上串行调用

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, mpsc::{self, Receiver, RecvTimeoutError}};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::settings::icloud_sync_dir;
use super::types::error_codes;

/// sidecar 协议版本；与 Python `protocol.PROTOCOL` 对齐
pub const SIDECAR_PROTOCOL: u32 = 1;

/// 单条 sidecar 响应事件（line-JSON 解析结果）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SidecarEvent {
  #[serde(rename = "type")]
  pub event_type: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub cmd: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub protocol: Option<u32>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub agent: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub code: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub detail: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub step: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub items: Option<Vec<Value>>,
  #[serde(flatten)]
  pub extra: HashMap<String, Value>,
}

/// sidecar 宿主侧错误（含机读 code）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarError {
  pub code: String,
  pub message: String,
}

impl SidecarError {
  pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
    Self {
      code: code.into(),
      message: message.into(),
    }
  }

  pub fn sidecar_missing(message: impl Into<String>) -> Self {
    Self::new(error_codes::SIDECAR_MISSING, message)
  }

  pub fn sidecar_version_mismatch(message: impl Into<String>) -> Self {
    Self::new(error_codes::SIDECAR_VERSION_MISMATCH, message)
  }

  pub fn sidecar_crashed(message: impl Into<String>) -> Self {
    Self::new(error_codes::SIDECAR_CRASHED, message)
  }
}

impl std::fmt::Display for SidecarError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}: {}", self.code, self.message)
  }
}

impl std::error::Error for SidecarError {}

impl From<serde_json::Error> for SidecarError {
  fn from(err: serde_json::Error) -> Self {
    Self::new("invalid_sidecar_json", err.to_string())
  }
}

impl From<std::io::Error> for SidecarError {
  fn from(err: std::io::Error) -> Self {
    Self::new("sidecar_io_error", err.to_string())
  }
}

/// 长驻 sidecar 客户端；P0 通过内部 Mutex 保证同一时刻仅一条 in-flight 请求
pub struct SidecarClient {
  inner: Mutex<SidecarInner>,
}

struct SidecarInner {
  process: Option<RunningSidecar>,
}

struct RunningSidecar {
  child: Child,
  stdin: ChildStdin,
  line_rx: Receiver<String>,
  stderr_tail: Arc<Mutex<String>>,
  agent_version: String,
}

enum AgentLaunch {
  /// 发布包：直接 spawn 捆绑 exe
  Bundled { program: PathBuf },
  /// 开发机：`ICLOUD_SYNC_AGENT_CMD` 解析为 program + args
  Dev {
    program: String,
    args: Vec<String>,
    work_dir: Option<PathBuf>,
  },
}

impl SidecarClient {
  pub fn new() -> Self {
    Self {
      inner: Mutex::new(SidecarInner { process: None }),
    }
  }

  /// 缓存的 agent 语义版本；需先 `ensure_started`
  pub fn agent_version(&self) -> Result<String, SidecarError> {
    let inner = self
      .inner
      .lock()
      .map_err(|_| SidecarError::new("sidecar_lock_poisoned", "sidecar mutex poisoned"))?;
    inner
      .process
      .as_ref()
      .map(|p| p.agent_version.clone())
      .ok_or_else(|| SidecarError::new("sidecar_not_started", "sidecar process is not running"))
  }

  /// 启动 sidecar（若已存活则跳过）并完成 protocol 握手
  pub fn ensure_started(&self, app: &AppHandle) -> Result<(), SidecarError> {
    let mut inner = self
      .inner
      .lock()
      .map_err(|_| SidecarError::new("sidecar_lock_poisoned", "sidecar mutex poisoned"))?;

    if let Some(process) = inner.process.as_mut() {
      if process.child.try_wait()?.is_none() {
        return Ok(());
      }
      inner.process = None;
    }

    let launch = resolve_agent_launch(app)?;
    let mut process = spawn_sidecar(launch)?;
    let version_event = exchange_line(
      &mut process,
      &serde_json::json!({ "cmd": "version" }),
      Duration::from_secs(120),
    )?;
    validate_version_event(&version_event)?;
    process.agent_version = version_event
      .agent
      .clone()
      .unwrap_or_else(|| "unknown".to_string());

    inner.process = Some(process);
    Ok(())
  }

  /// 终止 sidecar 子进程；下次 request 会按 resolve_agent_launch 重新拉起
  pub fn stop(&self) -> Result<(), SidecarError> {
    let mut inner = self
      .inner
      .lock()
      .map_err(|_| SidecarError::new("sidecar_lock_poisoned", "sidecar mutex poisoned"))?;
    if let Some(mut process) = inner.process.take() {
      let _ = process.child.kill();
      let _ = process.child.wait();
    }
    Ok(())
  }

  /// 向 sidecar 发送一条 JSON 命令并阻塞等待单行事件（P0 单飞）
  pub fn request(&self, app: &AppHandle, cmd: Value) -> Result<SidecarEvent, SidecarError> {
    self.request_with_timeout(app, cmd, Duration::from_secs(120))
  }

  /// 带自定义超时的 sidecar 请求；download_batch 等长任务使用
  pub fn request_with_timeout(
    &self,
    app: &AppHandle,
    cmd: Value,
    timeout: Duration,
  ) -> Result<SidecarEvent, SidecarError> {
    let mut inner = self
      .inner
      .lock()
      .map_err(|_| SidecarError::new("sidecar_lock_poisoned", "sidecar mutex poisoned"))?;

    if inner.process.is_none()
      || inner
        .process
        .as_mut()
        .and_then(|p| p.child.try_wait().transpose())
        .transpose()?
        .is_some()
    {
      drop(inner);
      self.ensure_started(app)?;
      inner = self
        .inner
        .lock()
        .map_err(|_| SidecarError::new("sidecar_lock_poisoned", "sidecar mutex poisoned"))?;
    }

    let process = inner
      .process
      .as_mut()
      .ok_or_else(|| SidecarError::sidecar_crashed("sidecar failed to start"))?;

    exchange_line(process, &cmd, timeout)
  }
}

impl Default for SidecarClient {
  fn default() -> Self {
    Self::new()
  }
}

/// pyicloud session 落盘目录：`<appData>/icloud-sync/session`
pub fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = icloud_sync_dir(app)?.join("session");
  std::fs::create_dir_all(&dir).map_err(|e| format!("创建 session 目录失败: {e}"))?;
  Ok(dir)
}

fn resolve_agent_launch(app: &AppHandle) -> Result<AgentLaunch, SidecarError> {
  if let Ok(raw) = std::env::var("ICLOUD_SYNC_AGENT_CMD") {
    let command_line = raw.trim().to_string();
    if !command_line.is_empty() {
      let tokens = split_command_tokens(&command_line);
      let (program, args) = tokens
        .split_first()
        .map(|(program, args)| (program.clone(), args.to_vec()))
        .ok_or_else(|| SidecarError::sidecar_missing("ICLOUD_SYNC_AGENT_CMD is empty"))?;
      return Ok(AgentLaunch::Dev {
        program,
        args,
        work_dir: dev_working_dir_from_command(&command_line),
      });
    }
  }

  // debug/dev：优先 repo 内 agent.py + sidecar .venv（含 pyicloud）；无 venv 时回退 bundled exe
  #[cfg(debug_assertions)]
  if let Some(launch) = try_repo_python_agent() {
    log::info!("icloud sidecar: using repo agent.py with sidecar venv (debug build)");
    return Ok(launch);
  }

  let mut checked: Vec<PathBuf> = Vec::new();
  if let Ok(resource_dir) = app.path().resource_dir() {
    checked.push(resource_dir.join("icloud-sync-agent.exe"));
  }
  // tauri dev 的 resource_dir 指向 target/debug，PyInstaller 产物在 src-tauri/resources/
  checked.push(
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("resources")
      .join("icloud-sync-agent.exe"),
  );

  for exe in &checked {
    if exe.is_file() {
      return Ok(AgentLaunch::Bundled { program: exe.clone() });
    }
  }

  let paths = checked
    .iter()
    .map(|p| p.display().to_string())
    .collect::<Vec<_>>()
    .join("; ");
  Err(SidecarError::sidecar_missing(format!(
    "未找到 sidecar 可执行文件（已检查: {paths}）。请在 apps/admin 下运行: pnpm run cs:sidecar-build"
  )))
}

/// debug 构建：使用 sidecar/.venv 内的 Python 跑 agent.py（与 cs:sidecar-build 同源依赖）
/// @note 无 .venv 时返回 None，回退 bundled exe，避免系统 `py -3` 缺 pyicloud
fn try_repo_python_agent() -> Option<AgentLaunch> {
  let sidecar_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../sidecar/icloudSync");
  let agent_py = sidecar_dir.join("agent.py");
  if !agent_py.is_file() {
    return None;
  }
  let venv_python = sidecar_dir.join(".venv").join("Scripts").join("python.exe");
  if !venv_python.is_file() {
    log::warn!(
      "icloud sidecar: sidecar/.venv not found ({}) — fall back to bundled exe; run: pnpm run cs:sidecar-build",
      venv_python.display()
    );
    return None;
  }
  let canonical_agent = agent_py.canonicalize().ok()?;
  let work_dir = canonical_agent.parent().map(Path::to_path_buf);
  let program = venv_python.canonicalize().unwrap_or(venv_python);
  Some(AgentLaunch::Dev {
    program: program.to_string_lossy().into_owned(),
    args: vec![canonical_agent.to_string_lossy().into_owned()],
    work_dir,
  })
}

fn dev_working_dir_from_command(command_line: &str) -> Option<PathBuf> {
  for token in split_command_tokens(command_line) {
    if token.ends_with("agent.py") {
      return PathBuf::from(token).parent().map(Path::to_path_buf);
    }
  }
  None
}

/// 简易命令行分词：支持双引号包裹路径（Windows dev override 常见）
fn split_command_tokens(command_line: &str) -> Vec<String> {
  let mut tokens = Vec::new();
  let mut current = String::new();
  let mut in_quotes = false;

  for ch in command_line.chars() {
    match ch {
      '"' => in_quotes = !in_quotes,
      ' ' | '\t' if !in_quotes => {
        if !current.is_empty() {
          tokens.push(current.clone());
          current.clear();
        }
      }
      _ => current.push(ch),
    }
  }
  if !current.is_empty() {
    tokens.push(current);
  }
  tokens
}

fn spawn_sidecar(launch: AgentLaunch) -> Result<RunningSidecar, SidecarError> {
  let mut command = match launch {
    AgentLaunch::Bundled { program } => {
      let mut cmd = Command::new(program);
      cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
      cmd
    }
    AgentLaunch::Dev {
      program,
      args,
      work_dir,
    } => {
      let mut cmd = Command::new(program);
      cmd
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
      if let Some(dir) = work_dir {
        cmd.current_dir(dir);
      }
      cmd
    }
  };

  // 继承宿主环境，便于 ICLOUD_SYNC_MOCK=1 等开发开关传入子进程
  command.envs(std::env::vars());
  command.env("PYTHONIOENCODING", "utf-8");
  command.env("PYTHONUTF8", "1");

  let mut child = command
    .spawn()
    .map_err(|e| SidecarError::sidecar_missing(format!("启动 sidecar 失败: {e}")))?;

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| SidecarError::sidecar_crashed("sidecar stdout pipe missing"))?;
  let stdin = child
    .stdin
    .take()
    .ok_or_else(|| SidecarError::sidecar_crashed("sidecar stdin pipe missing"))?;
  let stderr = child.stderr.take();

  let (tx, line_rx) = mpsc::channel();
  std::thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
      match line {
        Ok(text) => {
          if tx.send(text).is_err() {
            break;
          }
        }
        Err(_) => break,
      }
    }
  });

  let stderr_tail = Arc::new(Mutex::new(String::new()));
  if let Some(stderr) = stderr {
    let tail_store = stderr_tail.clone();
    std::thread::spawn(move || {
      let reader = BufReader::new(stderr);
      for line in reader.lines().map_while(Result::ok) {
        if let Ok(mut tail) = tail_store.lock() {
          if !tail.is_empty() {
            tail.push('\n');
          }
          tail.push_str(&line);
          if tail.len() > 4096 {
            let drain = tail.len().saturating_sub(4096);
            tail.drain(..drain);
          }
        }
      }
    });
  }

  Ok(RunningSidecar {
    child,
    stdin,
    line_rx,
    stderr_tail,
    agent_version: String::new(),
  })
}

fn sidecar_disconnect_message(process: &mut RunningSidecar) -> String {
  let exit = process
    .child
    .try_wait()
    .ok()
    .flatten()
    .map(|status| status.to_string())
    .unwrap_or_else(|| "unknown".to_string());
  let stderr = process
    .stderr_tail
    .lock()
    .map(|tail| tail.clone())
    .unwrap_or_default();
  if stderr.is_empty() {
    format!("sidecar stdout reader disconnected (exit={exit})")
  } else {
    format!("sidecar stdout reader disconnected (exit={exit}, stderr={stderr})")
  }
}

fn exchange_line(
  process: &mut RunningSidecar,
  cmd: &Value,
  timeout: Duration,
) -> Result<SidecarEvent, SidecarError> {
  let payload = serde_json::to_string(cmd)?;
  writeln!(process.stdin, "{payload}")?;
  process.stdin.flush()?;

  let line = process
    .line_rx
    .recv_timeout(timeout)
    .map_err(|err| match err {
      RecvTimeoutError::Timeout => SidecarError::sidecar_crashed(format!(
        "sidecar response timeout after {}s",
        timeout.as_secs()
      )),
      RecvTimeoutError::Disconnected => {
        SidecarError::sidecar_crashed(sidecar_disconnect_message(process))
      }
    })?;

  parse_event_line(&line)
}

fn parse_event_line(line: &str) -> Result<SidecarEvent, SidecarError> {
  serde_json::from_str(line).map_err(SidecarError::from)
}

fn validate_version_event(event: &SidecarEvent) -> Result<(), SidecarError> {
  if event.event_type != "version" {
    return Err(SidecarError::sidecar_version_mismatch(format!(
      "expected version event, got type={}",
      event.event_type
    )));
  }
  let protocol = event.protocol.ok_or_else(|| {
    SidecarError::sidecar_version_mismatch("version event missing protocol field")
  })?;
  if protocol != SIDECAR_PROTOCOL {
    return Err(SidecarError::sidecar_version_mismatch(format!(
      "protocol mismatch: expected {SIDECAR_PROTOCOL}, got {protocol}"
    )));
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::PathBuf;

  #[test]
  fn split_command_tokens_handles_quoted_path() {
    let tokens = split_command_tokens(r#"py -3 "E:\repo\apps\admin\sidecar\icloudSync\agent.py""#);
    assert_eq!(tokens, vec!["py", "-3", r"E:\repo\apps\admin\sidecar\icloudSync\agent.py"]);
  }

  #[test]
  fn dev_working_dir_from_agent_py_path() {
    let cmd = r#"py -3 "E:\repo\apps\admin\sidecar\icloudSync\agent.py""#;
    let dir = dev_working_dir_from_command(cmd).expect("working dir");
    assert_eq!(
      dir,
      PathBuf::from(r"E:\repo\apps\admin\sidecar\icloudSync")
    );
  }

  /// 联调：需设置 ICLOUD_SYNC_MOCK=1 与 ICLOUD_SYNC_AGENT_CMD（见 task-5-report）
  #[test]
  fn mock_sidecar_version_handshake() {
    if std::env::var("ICLOUD_SYNC_RUN_INTEGRATION").ok().as_deref() != Some("1") {
      return;
    }
    let cmd = std::env::var("ICLOUD_SYNC_AGENT_CMD").expect("ICLOUD_SYNC_AGENT_CMD");
    assert!(
      !cmd.trim().is_empty(),
      "ICLOUD_SYNC_AGENT_CMD must not be empty"
    );

    let tokens = split_command_tokens(&cmd);
    let (program, args) = tokens.split_first().expect("command tokens");
    let launch = AgentLaunch::Dev {
      program: program.clone(),
      args: args.to_vec(),
      work_dir: dev_working_dir_from_command(&cmd),
    };
    let mut process = spawn_sidecar(launch).expect("spawn sidecar");
    let event = exchange_line(
      &mut process,
      &serde_json::json!({ "cmd": "version" }),
      Duration::from_secs(120),
    )
    .expect("version handshake");
    validate_version_event(&event).expect("protocol must match");
    assert_eq!(event.agent.as_deref(), Some("0.1.0"));
  }
}
