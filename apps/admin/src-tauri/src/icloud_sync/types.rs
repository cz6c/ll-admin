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
  /// 并发下载数；P1 允许 1–3，由设置页配置
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
  /// iCloud 根域：`com` 国际 / `cn` 中国大陆
  #[serde(default = "default_icloud_domain")]
  pub icloud_domain: String,
}

fn default_icloud_domain() -> String {
  "cn".to_string()
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
      icloud_domain: default_icloud_domain(),
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
  /// 正在拉取 iCloud 图库目录（后台线程，不阻塞 UI）
  Cataloging,
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
      Self::Cataloging => "cataloging",
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
      "cataloging" => Some(Self::Cataloging),
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

/// iCloud 资产持久态（写入 assets.cloud_state）
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CloudState {
  /// 待同步（含 catalog 新增与 iCloud 有更新）
  CloudOnly,
  Synced,
  DeletedCloudPending,
  CloudDeleteQueued,
  FailedDelete,
}

impl CloudState {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::CloudOnly => "cloud_only",
      Self::Synced => "synced",
      Self::DeletedCloudPending => "deleted_cloud_pending",
      Self::CloudDeleteQueued => "cloud_delete_queued",
      Self::FailedDelete => "failed_delete",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "cloud_only" | "modified_cloud" => Some(Self::CloudOnly),
      "synced" => Some(Self::Synced),
      "deleted_cloud_pending" => Some(Self::DeletedCloudPending),
      "cloud_delete_queued" => Some(Self::CloudDeleteQueued),
      "failed_delete" => Some(Self::FailedDelete),
      _ => None,
    }
  }
}

/// 全局任务类型：同一时刻仅允许一个未完成任务
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskType {
  Sync,
  CloudDelete,
  Catalog,
}

impl TaskType {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Sync => "sync",
      Self::CloudDelete => "cloud_delete",
      Self::Catalog => "catalog",
    }
  }

  pub fn parse(s: &str) -> Option<Self> {
    match s {
      "sync" => Some(Self::Sync),
      "cloud_delete" => Some(Self::CloudDelete),
      "catalog" => Some(Self::Catalog),
      _ => None,
    }
  }
}

/// 抽屉云管理列表行
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncAssetRow {
  pub asset_id: String,
  pub part: String,
  /// catalog 全局序号（Live still+mov 共享；与落盘 `{index:05d}_` 一致）
  pub index_num: i32,
  /// catalog 排序键：Library=拍摄时间(capture_at)，Recents=加入时间(added_at)
  pub sort_key: String,
  pub original_filename: String,
  /// Live Photo 配对 mov 文件名；catalog 常 still/mov 同名，展示时会推导 .MOV
  pub live_mov_filename: Option<String>,
  /// Live Photo 配对 mov 的 job 内 download_status（合并行展示取 still+mov 更差一侧）
  pub live_mov_download_status: Option<String>,
  pub media_kind: String,
  pub live_pair_id: Option<String>,
  pub dest_path: Option<String>,
  pub cloud_state: String,
  pub download_status: Option<String>,
  pub last_synced_at: Option<i64>,
  pub last_catalog_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncLoadAssetsResult {
  pub items: Vec<SyncAssetRow>,
  pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncCloudStateSummary {
  pub cloud_only: u32,
  pub synced: u32,
  pub deleted_cloud_pending: u32,
  pub cloud_delete_queued: u32,
  pub failed_delete: u32,
  /// 派生：活跃 sync job 内 download_status=failed 的行数；任务结束 finalize 后为 0
  pub download_failed: u32,
  /// 最近一次 catalog 写入 assets 的时间（秒）；无记录时为 null
  #[serde(skip_serializing_if = "Option::is_none")]
  pub last_catalog_at: Option<i64>,
}

/// SQLite jobs 行
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRow {
  pub id: i64,
  pub task_type: TaskType,
  pub view: JobView,
  pub output_dir: String,
  pub apple_id: String,
  pub status: JobStatus,
  pub mode: String,
  pub created_at: i64,
  pub finished_at: Option<i64>,
  pub total_count: u32,
  pub done_count: u32,
  pub failed_count: u32,
  pub pending_count: u32,
}

/// SQLite assets 行（Rust 内部）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssetRow {
  pub id: i64,
  pub apple_id: String,
  pub asset_id: String,
  pub sort_key: String,
  pub original_filename: String,
  pub media_kind: MediaKind,
  pub live_pair_id: Option<String>,
  pub index_num: i32,
  pub part: AssetPart,
  pub download_status: Option<AssetStatus>,
  pub active_job_id: Option<i64>,
  pub dest_path: Option<String>,
  pub cloud_state: CloudState,
  pub last_synced_at: Option<i64>,
  pub last_catalog_at: Option<i64>,
  pub last_error: Option<String>,
  pub attempt_count: i32,
  /// CloudKit CPLAsset.recordName；catalog 落库，删云必填
  pub cpl_asset_record_name: Option<String>,
  /// 最近一次 catalog 看到的 recordChangeTag；删前可按 recordName 定点刷新
  pub cpl_asset_change_tag: Option<String>,
}

/// 失败资产摘要（供同步页表格展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncFailedAssetRow {
  pub index_num: i32,
  pub part: String,
  pub original_filename: String,
  pub last_error: String,
  pub attempt_count: i32,
}

/// 单文件任务行（同步页全量任务表格）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncAssetTaskRow {
  pub index_num: i32,
  pub part: String,
  pub original_filename: String,
  /// `pending` | `done` | `failed`
  pub status: String,
  pub last_error: Option<String>,
  pub attempt_count: i32,
}

/// 分页查询文件任务列表
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IcloudSyncListAssetTasksResult {
  pub items: Vec<IcloudSyncAssetTaskRow>,
  pub total: u32,
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
  /// 任务 apple_id 与 settings 当前账号不一致
  pub const ACCOUNT_MISMATCH: &str = "account_mismatch";
  /// 已有有效 session，须先 logout 再 login
  pub const ALREADY_LOGGED_IN: &str = "already_logged_in";
  /// 所选 iCloud 区域与 Apple ID 不匹配
  pub const DOMAIN_MISMATCH: &str = "domain_mismatch";
  pub const DELETE_FAILED: &str = "delete_failed";
  /// 已有未完成任务，须先取消
  pub const TASK_ACTIVE: &str = "task_active";
}
