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
  /** 拍摄时间（sync/EXIF，缩略图后写入） */
  captureAt?: string;
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

/** 重复清理：一组内单个可删 legacy 副本 */
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

/** 重复清理：一个 sync 正本 + 多个 legacy 副本 */
export interface DuplicateGroup {
  contentKey: string;
  mediaKind: "photo" | "video" | "live" | string;
  assetId: string;
  canonical: DuplicateFileSide;
  duplicates: DuplicateLegacyItem[];
  /** 同 stem 存在多个 sync 正本，按 stem 匹配可能不准 */
  ambiguousStem: boolean;
}

/** 查看器扁平化后的单项：文件 + 所属目录名 */
export interface FlatFile<T = MediaFile> {
  file: T;
  groupName: string;
}
