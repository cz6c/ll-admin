//! 相册数据类型
//! 职责：定义设置、媒体文件、分组等结构体

use serde::{Deserialize, Serialize};

/// 相册设置（持久化到 `<appData>/album/settings.json`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumSettings {
  /// 相册根目录绝对路径
  pub root_dir: String,
  /// 缩略图尺寸（像素），固定 158
  #[serde(default = "default_thumb_size")]
  pub thumb_size: u32,
}

fn default_thumb_size() -> u32 {
  158
}

impl Default for AlbumSettings {
  fn default() -> Self {
    Self {
      root_dir: String::new(),
      thumb_size: default_thumb_size(),
    }
  }
}

/// 媒体类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
  /// 普通图片
  Image,
  /// 普通视频
  Video,
  /// iPhone 实况照片（JPG+MOV 配对）
  LivePhoto,
}

/// 单个媒体文件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
  /// 文件绝对路径
  pub path: String,
  /// 文件名（含扩展名）
  pub name: String,
  /// 媒体类型
  pub kind: MediaKind,
  /// 文件大小（字节）
  pub size: u64,
  /// 修改时间（Unix 秒）
  pub modified: i64,
  /// 扩展名（小写，不含点）
  pub ext: String,
  /// 缩略图 base64 data URL（扫描时生成，前端直接渲染，零 asset 协议开销）
  pub thumb_data: Option<String>,
  /// 实况照片配对的视频路径（仅 LivePhoto 有值）
  pub video_path: Option<String>,
}

/// 目录分组
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaGroup {
  /// 目录名（最后一级）
  pub dir_name: String,
  /// 目录绝对路径
  pub dir_path: String,
  /// 相对于根目录的路径（根目录本身为 "."）
  pub rel_path: String,
  /// 该目录下的媒体文件列表
  pub files: Vec<MediaFile>,
}

/// 相册扫描进度事件负载（`album://scan-progress`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumScanProgressPayload {
  /// `discover`：遍历文件；`thumbnails`：生成缩略图
  pub phase: String,
  pub done: u32,
  pub total: u32,
}
