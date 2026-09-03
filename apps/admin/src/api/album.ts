/**
 * 本地相册 Tauri 命令封装
 * 职责：扫描设置之外的按需能力（HEVC 播放代理、重复检测等）
 */
import { invoke } from "@tauri-apps/api/core";
import type { DuplicateGroup } from "@/views/album/types";

/**
 * 确保视频可在 WebView 中播放：HEVC 转 H.264 MP4 缓存，H.264 等直接返回原路径
 * @param path 源视频绝对路径
 * @returns 可直接 `convertFileSrc` 的播放路径
 */
export async function ensureAlbumPlayback(path: string): Promise<string> {
  return invoke<string>("album_ensure_playback", { path });
}

/**
 * 扫描 sync 正本与 legacy 重复组（不删盘）
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
