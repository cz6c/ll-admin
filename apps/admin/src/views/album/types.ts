/**
 * 相册共享类型与事件常量
 * 职责：与后端 src-tauri/src/album/types.rs 字段保持一致，前端三处复用避免重复定义
 */

export const ALBUM_SCAN_PROGRESS_EVENT = "album://scan-progress";
export const ALBUM_THUMB_READY_EVENT = "album://thumb-ready";

export interface AlbumScanProgressPayload {
  phase: "discover" | "thumbnails" | string;
  done: number;
  total: number;
}

export interface AlbumThumbReadyPayload {
  path: string;
  thumbPath?: string;
  previewPath?: string;
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
}

export interface MediaGroup {
  dirName: string;
  dirPath: string;
  relPath: string;
  files: MediaFile[];
}

/** 查看器扁平化后的单项：文件 + 所属目录名 */
export interface FlatFile<T = MediaFile> {
  file: T;
  groupName: string;
}
