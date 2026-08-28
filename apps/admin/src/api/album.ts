/**
 * 本地相册 Tauri 命令封装
 * 职责：扫描设置之外的按需能力（HEVC 播放代理等）
 */
import { invoke } from "@tauri-apps/api/core";

/**
 * 确保视频可在 WebView 中播放：HEVC 转 H.264 MP4 缓存，H.264 等直接返回原路径
 * @param path 源视频绝对路径
 * @returns 可直接 `convertFileSrc` 的播放路径
 */
export async function ensureAlbumPlayback(path: string): Promise<string> {
  return invoke<string>("album_ensure_playback", { path });
}
