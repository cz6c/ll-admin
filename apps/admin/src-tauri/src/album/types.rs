//! 相册数据类型
//! 职责：定义设置、媒体文件、分组等结构体

use serde::{Deserialize, Serialize};

/// 磁盘缓存目录代际（`album/thumbs/v{N}/`）；bump 时删旧 v* 目录并清 DB 缓存路径
/// - v4: cache_key 曾混入本常量；discover 复用 DB 绝对路径，与 hash 无关
/// - v5: cache_key 仅 stem + modified + size；目录版本单独负责批量作废
pub const ALBUM_CACHE_VERSION: u32 = 5;

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
  /// 网格缩略图缓存绝对路径（前端 `convertFileSrc`）
  pub thumb_path: Option<String>,
  /// HEIC/HEIF 全尺寸预览缓存路径（懒加载，打开查看器时生成）
  pub preview_path: Option<String>,
  /// HEVC 播放代理 MP4；普通视频为 path 的代理，Live 为 video_path(mov) 的代理
  pub playback_path: Option<String>,
  /// 实况照片配对的视频路径（仅 LivePhoto 有值）
  pub video_path: Option<String>,
  /// 拍摄时间（ISO/可解析串）；缩略图就绪后由 sync/EXIF 写入 media.db
  pub capture_at: Option<String>,
  /// 拍摄设备（EXIF Make+Model）；仅缺省时由 EXIF 补写
  pub camera: Option<String>,
  /// 像素宽（优先缩略图解码）
  pub width: Option<u32>,
  /// 像素高（优先缩略图解码）
  pub height: Option<u32>,
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

/// 单张缩略图就绪事件（`album://thumb-ready`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumThumbReadyPayload {
  pub path: String,
  pub thumb_path: Option<String>,
  pub preview_path: Option<String>,
  /// 缩略图后解析到的拍摄时间；仅回填元数据时路径字段可为 None
  pub capture_at: Option<String>,
  pub camera: Option<String>,
  pub width: Option<u32>,
  pub height: Option<u32>,
  /// Live mov / 视频播放代理；path 为 still（Live）或视频自身
  pub playback_path: Option<String>,
}

/// `album_ensure_playback` 返回：可播放路径 + 可选 ffprobe 分辨率（单独视频落库用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPlaybackResult {
  /// WebView 可播路径（原文件或 `_play.mp4` 代理）
  pub path: String,
  pub width: Option<u32>,
  pub height: Option<u32>,
}

/// 重复清理弹窗：单侧文件（正本或 legacy）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFileSide {
  /// 主文件绝对路径（Live 为 still；仅 mov 时为 mov）
  pub path: String,
  /// 文件名
  pub name: String,
  /// 扩展名（小写）
  pub ext: String,
  /// Live 配对 mov 路径
  pub video_path: Option<String>,
  /// 网格缩略图或 HEIC 预览缓存（供 WebView 展示）
  pub thumb_path: Option<String>,
}

/// 重复清理：匹配置信度（主文件内容哈希已相同后的细分）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateMatchConfidence {
  /// 主文件哈希相同，但 Live mov 缺失或 mov 哈希不一致
  Medium,
  /// 主文件（及 Live mov）内容哈希一致
  High,
}

/// 重复清理：一组内单个可删 legacy 副本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateLegacyItem {
  pub duplicate: DuplicateFileSide,
  pub incomplete: bool,
  pub incomplete_note: Option<String>,
  pub confidence: DuplicateMatchConfidence,
  /// 正本主文件字节数（Live 为 still）
  pub canonical_size: u64,
  /// 副本主文件字节数
  pub duplicate_size: u64,
}

/// 一组本地重复：按主文件内容哈希归组后选出的正本 + 可删副本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
  /// 展示键（优先原名 stem；归组实际按 BLAKE3）
  pub content_key: String,
  /// `photo` / `video` / `live`
  pub media_kind: String,
  /// 正本对应的 iCloud asset_id；无落库时为 `hash:{prefix}`
  pub asset_id: String,
  /// 保留侧（优先 sync 库已落库路径）
  pub canonical: DuplicateFileSide,
  /// 可删副本（默认可勾选删除）
  pub duplicates: Vec<DuplicateLegacyItem>,
  /// 同组内存在多个不同落库 asset_id
  pub ambiguous_stem: bool,
}
