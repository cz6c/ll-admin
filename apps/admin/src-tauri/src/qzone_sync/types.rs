//! QQ 空间同步公开类型
//! 职责：设置、会话、任务进度、相册/媒体摘要（前后端 camelCase）

use serde::{Deserialize, Serialize};

/// `<appData>/qzone-sync/settings.json`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneSyncSettings {
  /// 并发下载 1–3
  #[serde(default = "default_concurrency")]
  pub concurrency: u32,
}

fn default_concurrency() -> u32 {
  2
}

impl Default for QzoneSyncSettings {
  fn default() -> Self {
    Self {
      concurrency: default_concurrency(),
    }
  }
}

/// 登录后持久化的最小 cookie 集（仅本机）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneSession {
  pub uin: String,
  pub p_skey: String,
  #[serde(default)]
  pub skey: String,
  /// 原始 Cookie 头片段（含其它域字段，便于透传）
  #[serde(default)]
  pub cookie_header: String,
}

/// 前端展示的登录态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneAuthState {
  pub logged_in: bool,
  pub uin: Option<String>,
}

/// 云相册摘要（catalog / 浏览）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneAlbumSummary {
  pub topic_id: String,
  pub name: String,
  pub total: u32,
  /// 封面图 URL（需经 fetch_media 代理，防盗链）
  #[serde(default)]
  pub cover_url: String,
  /// 相册权限码（删图接口 priv；缺省 1=公开）
  #[serde(default = "default_album_priv")]
  pub album_priv: i32,
}

fn default_album_priv() -> i32 {
  1
}

/// 前端浏览用相片摘要（缩略图 / 预览 / 原图 URL 均可能需代理）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzonePhotoView {
  pub asset_id: String,
  pub name: String,
  /// 所属相册 topicId；视频预览/下载时调 floatview 需要
  #[serde(default)]
  pub album_id: String,
  /// `image` | `video`
  pub media_kind: String,
  pub thumb_url: String,
  /// 灯箱预览：图片为中图；视频为可播地址（勿用封面图）
  pub preview_url: String,
  /// 原图/原视频下载地址（视频灯箱优先用此字段落盘预览）
  #[serde(default)]
  pub download_url: String,
  /// 拍摄/上传时间原文（有则前端按日分组时间轴）
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub capture_at: Option<String>,
  /// 删图用定位串；缺省与 asset_id（lloc）相同
  #[serde(default)]
  pub sloc: String,
  /// 本机已下载（sync `cloud_state=synced` 且 dest_path 非空）
  #[serde(default)]
  pub downloaded: bool,
}

/// 批量从 QQ 空间移除（本机文件保留）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneDeletePhotoItem {
  pub album_id: String,
  pub asset_id: String,
  #[serde(default)]
  pub sloc: String,
  /// 相册权限码；0/缺省时服务端按 1
  #[serde(default)]
  pub album_priv: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneDeletePhotosResult {
  pub deleted: u32,
  pub failed: u32,
  #[serde(default)]
  pub message: String,
}

/// 批量上传到指定相册的结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneUploadPhotosResult {
  pub uploaded: u32,
  pub failed: u32,
  #[serde(default)]
  pub message: String,
}

/// Tauri 代理拉回的媒体（前端拼 data URL）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneMediaBlob {
  pub content_type: String,
  pub data_base64: String,
}

/// 任务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QzoneJobStatus {
  Idle,
  Cataloging,
  Downloading,
  Paused,
  Done,
  Failed,
}

impl QzoneJobStatus {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Idle => "idle",
      Self::Cataloging => "cataloging",
      Self::Downloading => "downloading",
      Self::Paused => "paused",
      Self::Done => "done",
      Self::Failed => "failed",
    }
  }
}

/// 进度事件 / job_status 返回
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QzoneJobSnapshot {
  pub status: String,
  pub phase: String,
  pub done: u32,
  pub total: u32,
  pub message: String,
  pub updated: u32,
  pub skipped: u32,
  pub failed: u32,
}

impl Default for QzoneJobSnapshot {
  fn default() -> Self {
    Self {
      status: QzoneJobStatus::Idle.as_str().into(),
      phase: "idle".into(),
      done: 0,
      total: 0,
      message: String::new(),
      updated: 0,
      skipped: 0,
      failed: 0,
    }
  }
}
