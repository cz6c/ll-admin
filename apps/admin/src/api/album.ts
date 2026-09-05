/**
 * 本地相册 Tauri 命令封装
 * 职责：扫描设置之外的按需能力（HEVC 播放代理、重复检测等）
 */
import { invoke } from "@tauri-apps/api/core";
import type { DuplicateGroup } from "@/views/album/types";

/** `album_ensure_playback` 返回：可播路径 + 可选编码分辨率 */
export interface AlbumPlaybackResult {
  path: string;
  width?: number;
  height?: number;
}

/**
 * 确保视频可在 WebView 中播放：HEVC 转 H.264 MP4 缓存，H.264 等直接返回原路径
 * 单独视频会顺带 ffprobe 分辨率并落库
 * @param path 源视频绝对路径
 */
export async function ensureAlbumPlayback(path: string): Promise<AlbumPlaybackResult> {
  return invoke<AlbumPlaybackResult>("album_ensure_playback", { path });
}

/**
 * 扫描相册根全量重复组（组内落库优先正本；不删盘）
 */
export async function findAlbumLocalDuplicates(): Promise<DuplicateGroup[]> {
  return invoke<DuplicateGroup[]>("album_find_local_duplicates");
}

/** 重复清理弹窗：可见行 lazy 解析缩略图路径 */
export async function resolveDuplicateThumb(path: string): Promise<string | null> {
  return invoke<string | null>("album_resolve_duplicate_thumb", { path });
}

/**
 * 删除本地媒体：原文件进系统回收站，缩略图等缓存永久删除（不触碰 iCloud sync 注册表）
 */
export async function deleteAlbumLocal(paths: string[]): Promise<number> {
  return invoke<number>("album_delete_local", { paths });
}

/**
 * 在系统资源管理器中打开相册子目录
 * @param relPath 树节点 key（`.` 为相册根）
 */
export async function openAlbumDir(relPath: string): Promise<void> {
  await invoke("album_open_dir", { relPath });
}
