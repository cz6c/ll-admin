/**
 * 相册共享类型与事件常量
 * 职责：与后端 src-tauri/src/album/types.rs 字段保持一致，前端三处复用避免重复定义
 */

export const ALBUM_SCAN_PROGRESS_EVENT = "album://scan-progress";
export const ALBUM_THUMB_READY_EVENT = "album://thumb-ready";

/**
 * 磁盘缩略图生成分辨率（px，正方形边长）
 * 与 Rust `album/types.rs` 的 `default_thumb_size` 保持一致；仅用于扫描/生成，与宫格 UI 显示尺寸无关
 */
export const ALBUM_THUMB_GENERATE_SIZE = 158;

export interface AlbumScanProgressPayload {
  phase: "discover" | "thumbnails" | string;
  done: number;
  total: number;
}

export interface AlbumThumbReadyPayload {
  path: string;
  thumbPath?: string;
  previewPath?: string;
  /** 缩略图就绪后回填的拍摄时间 */
  captureAt?: string;
  camera?: string;
  width?: number;
  height?: number;
  /** Live mov / 视频 H.264 播放代理 */
  playbackPath?: string;
}

export type MediaKind = "image" | "video" | "livephoto";

export interface MediaFile {
  path: string;
  name: string;
  kind: MediaKind;
  size: number;
  modified: number;
  ext: string;
  thumbPath?: string;
  previewPath?: string;
  videoPath?: string;
  /** HEVC→H.264 播放代理；Live 绑 still，值为 mov 的代理路径 */
  playbackPath?: string;
  /** 拍摄时间（sync/EXIF，缩略图后写入） */
  captureAt?: string;
  /** 拍摄设备（EXIF Make+Model） */
  camera?: string;
  /** 像素宽（优先缩略图解码） */
  width?: number;
  /** 像素高（优先缩略图解码） */
  height?: number;
}

export interface MediaGroup {
  dirName: string;
  dirPath: string;
  relPath: string;
  files: MediaFile[];
}

/** 重复清理：单侧文件路径 */
export interface DuplicateFileSide {
  path: string;
  name: string;
  ext: string;
  videoPath?: string;
  /** WebP/JPEG 缩略图缓存；HEIC 不可用原 path 直接展示 */
  thumbPath?: string;
}

/** 重复清理：主文件内容哈希相同后的细分置信度 */
export type DuplicateMatchConfidence = "low" | "medium" | "high";

export interface DuplicateLegacyItem {
  duplicate: DuplicateFileSide;
  incomplete: boolean;
  incompleteNote?: string;
  confidence: DuplicateMatchConfidence;
  /** 正本主文件字节数（Live 为 still） */
  canonicalSize: number;
  duplicateSize: number;
}

/** 重复清理：全量按内容哈希归组；正本优先落库路径 */
export interface DuplicateGroup {
  /** 展示用（原名 stem）；实际归组按 BLAKE3 */
  contentKey: string;
  mediaKind: "photo" | "video" | "live" | string;
  /** 落库 asset_id；无落库时为 hash:{prefix} */
  assetId: string;
  canonical: DuplicateFileSide;
  duplicates: DuplicateLegacyItem[];
  /** 同组内多个不同落库 asset_id */
  ambiguousStem: boolean;
}

/** 查看器扁平化后的单项：文件 + 所属目录名 */
export interface FlatFile<T = MediaFile> {
  file: T;
  groupName: string;
}
