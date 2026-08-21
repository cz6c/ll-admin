//! iCloud 同步领域类型
//! 职责：Settings / Job / Asset DTO、状态枚举与机读错误码常量
//! 适用：Rust 队列、SQLite 落盘与前端 invoke 共用

use serde::{Deserialize, Serialize};

fn default_concurrency() -> u32 {
  1
}

/// 非敏感配置（Apple ID 密码不在此结构，见 keyring_store）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncSettings {
  /// 同步落盘绝对路径；空时由 resolve_default_output_dir 推导
  #[serde(default)]
  pub output_dir: String,
  /// 并发下载数；P0 固定默认 1，前端控件灰显
  #[serde(default = "default_concurrency")]
  pub concurrency: u32,
  /// 上次登录 Apple ID（日志脱敏由调用方负责）
  #[serde(default)]
  pub apple_id: String,
  /// 已勾选锁号风险 ToS
  #[serde(default)]
  pub risk_accepted: bool,
  /// 已确认开启「网页访问 iCloud 数据」
  #[serde(default)]
  pub checklist_web_access: bool,
  /// 已确认关闭 Advanced Data Protection
  #[serde(default)]
  pub checklist_adp_off: bool,
}

impl Default for IcloudSyncSettings {
  fn default() -> Self {
    Self {
      output_dir: String::new(),
      concurrency: default_concurrency(),
      apple_id: String::new(),
      risk_accepted: false,
      checklist_web_access: false,
      checklist_adp_off: false,
    }
  }
}

/// 同步任务视图：Library 与 Recents 互斥
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum JobView {
  /// 全部照片，按拍摄时间排序
  Library,
  /// 最近项目，按加入时间排序
  Recents,
}

impl JobView {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Library => "library",
      Self::Recents => "recents",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "library" => Some(Self::Library),
      "recents" => Some(Self::Recents),
      _ => None,
    }
  }
}

/// 任务生命周期状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
  /// 已建库、待下载
  Pending,
  /// 下载进行中
  Running,
  /// session 失效暂停，保留 SQLite 进度，待用户显式重认证
  PausedSession,
  /// 用户手动暂停，保留 SQLite 进度，可 resume 续传
  PausedUser,
  /// 全部资产处理完毕
  Done,
  /// 锁定/限流等不可恢复错误
  Failed,
}

impl JobStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Pending => "pending",
      Self::Running => "running",
      Self::PausedSession => "paused_session",
      Self::PausedUser => "paused_user",
      Self::Done => "done",
      Self::Failed => "failed",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "pending" => Some(Self::Pending),
      "running" => Some(Self::Running),
      "paused_session" => Some(Self::PausedSession),
      "paused_user" => Some(Self::PausedUser),
      "done" => Some(Self::Done),
      "failed" => Some(Self::Failed),
      _ => None,
    }
  }
}

/// sidecar catalog 媒体类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
  Photo,
  Video,
  Live,
}

impl MediaKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Photo => "photo",
      Self::Video => "video",
      Self::Live => "live",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "photo" => Some(Self::Photo),
      "video" => Some(Self::Video),
      "live" => Some(Self::Live),
      _ => None,
    }
  }
}

/// 单资产下载部件：普通图为 still；Live 同 index 的 still+mov 成对
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AssetPart {
  Still,
  Mov,
  /// 非 Live 整文件（photo/video）
  Full,
}

impl AssetPart {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Still => "still",
      Self::Mov => "mov",
      Self::Full => "full",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "still" => Some(Self::Still),
      "mov" => Some(Self::Mov),
      "full" => Some(Self::Full),
      _ => None,
    }
  }
}

/// 单资产行状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AssetStatus {
  Pending,
  Done,
  Failed,
}

impl AssetStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Pending => "pending",
      Self::Done => "done",
      Self::Failed => "failed",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "pending" => Some(Self::Pending),
      "done" => Some(Self::Done),
      "failed" => Some(Self::Failed),
      _ => None,
    }
  }
}

/// SQLite jobs 行（Rust 内部）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRow {
  pub id: i64,
  pub view: JobView,
  pub output_dir: String,
  pub apple_id: String,
  pub status: JobStatus,
  pub created_at: i64,
}

/// SQLite assets 行（Rust 内部）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetRow {
  pub id: i64,
  pub job_id: i64,
  pub asset_id: String,
  pub sort_key: String,
  pub original_filename: String,
  pub media_kind: MediaKind,
  pub live_pair_id: Option<String>,
  pub index_num: i32,
  pub part: AssetPart,
  pub status: AssetStatus,
  pub dest_path: Option<String>,
}

/// sidecar / 队列机读错误码（与 Python protocol 对齐）
pub mod error_codes {
  pub const SIDECAR_MISSING: &str = "sidecar_missing";
  pub const SIDECAR_VERSION_MISMATCH: &str = "sidecar_version_mismatch";
  pub const AUTH_FAILED: &str = "auth_failed";
  pub const NEED_2FA: &str = "need_2fa";
  pub const SESSION_EXPIRED: &str = "session_expired";
  pub const ACCOUNT_LOCKED: &str = "account_locked";
  pub const RATE_LIMITED: &str = "rate_limited";
  pub const CATALOG_SORT_MISSING: &str = "catalog_sort_missing";
  pub const LIVE_BIND_MISSING: &str = "live_bind_missing";
  pub const DOWNLOAD_FAILED: &str = "download_failed";
  pub const SIDECAR_CRASHED: &str = "sidecar_crashed";
}
