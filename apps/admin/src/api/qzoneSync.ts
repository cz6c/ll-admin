/**
 * QQ 空间同步 API（Tauri invoke）
 * 职责：第二备份源登录 / 浏览 / 设置 / 同步任务；与 icloudSync 平行
 * 适用：相册页 QzoneSyncFab、CS 设置
 */
import { invoke } from "@tauri-apps/api/core";

export interface QzoneSyncSettings {
  outputDir: string;
  concurrency: number;
}

export interface QzoneAuthState {
  loggedIn: boolean;
  uin?: string | null;
}

export interface QzoneAlbumSummary {
  topicId: string;
  name: string;
  total: number;
  coverUrl?: string;
}

export interface QzonePhotoView {
  assetId: string;
  name: string;
  /** 所属相册 topicId；视频 floatview 解析需要 */
  albumId?: string;
  mediaKind: string;
  thumbUrl: string;
  previewUrl: string;
  /** 原图/原视频；视频灯箱优先用此地址落盘预览 */
  downloadUrl?: string;
  /** 拍摄/上传时间原文；有则前端按日分组 */
  captureAt?: string | null;
}

export interface QzoneMediaBlob {
  contentType: string;
  dataBase64: string;
}

export interface QzoneJobSnapshot {
  status: string;
  phase: string;
  done: number;
  total: number;
  message: string;
  updated: number;
  skipped: number;
  failed: number;
}

export async function getQzoneSyncSettings(): Promise<QzoneSyncSettings> {
  return invoke<QzoneSyncSettings>("qzone_sync_get_settings");
}

export async function saveQzoneSyncSettings(settings: QzoneSyncSettings): Promise<QzoneSyncSettings> {
  return invoke<QzoneSyncSettings>("qzone_sync_save_settings", { settings });
}

export async function getQzoneDefaultOutputDir(): Promise<string | null> {
  return invoke<string | null>("qzone_sync_default_output_dir");
}

export async function getQzoneAuthState(): Promise<QzoneAuthState> {
  return invoke<QzoneAuthState>("qzone_sync_auth_state");
}

export type QzoneQrStatus = "waiting" | "scanned" | "expired" | "success" | "error";

export interface QzoneQrStartResult {
  imageDataUrl: string;
  expiresInSecs: number;
}

export interface QzoneQrPollResult {
  status: QzoneQrStatus;
  message: string;
  auth?: QzoneAuthState | null;
}

/** 开始扫码：返回二维码 data URL */
export async function startQzoneQrLogin(): Promise<QzoneQrStartResult> {
  return invoke<QzoneQrStartResult>("qzone_sync_qr_start");
}

/** 轮询扫码状态；success 时会话已落盘 */
export async function pollQzoneQrLogin(): Promise<QzoneQrPollResult> {
  return invoke<QzoneQrPollResult>("qzone_sync_qr_poll");
}

export async function logoutQzone(): Promise<void> {
  return invoke("qzone_sync_logout");
}

/**
 * 同步到本地
 * @param albumId 有值则仅该相册；否则全部
 */
export async function startQzoneSyncJob(albumId?: string | null): Promise<QzoneJobSnapshot> {
  return invoke<QzoneJobSnapshot>("qzone_sync_start_job", {
    albumId: albumId || null
  });
}

export async function pauseQzoneSyncJob(): Promise<QzoneJobSnapshot> {
  return invoke<QzoneJobSnapshot>("qzone_sync_pause_job");
}

export async function resumeQzoneSyncJob(): Promise<QzoneJobSnapshot> {
  return invoke<QzoneJobSnapshot>("qzone_sync_resume_job");
}

export async function cancelQzoneSyncJob(): Promise<QzoneJobSnapshot> {
  return invoke<QzoneJobSnapshot>("qzone_sync_cancel_job");
}

export async function getQzoneJobStatus(): Promise<QzoneJobSnapshot> {
  return invoke<QzoneJobSnapshot>("qzone_sync_job_status");
}

export async function listQzoneAlbums(): Promise<QzoneAlbumSummary[]> {
  return invoke<QzoneAlbumSummary[]>("qzone_sync_list_albums");
}

/** 某相册相片浏览列表 */
export async function listQzonePhotos(albumId: string): Promise<QzonePhotoView[]> {
  return invoke<QzonePhotoView[]>("qzone_sync_list_photos", { albumId });
}

/**
 * 远端媒体 → WebView 可加载的本地协议 URL（Win: http://qzoneimg.localhost）
 * 与相册 convertFileSrc 同思路：不经 invoke/base64，由 WebView 并行加载+缓存
 * @param kind thumb 限小体积；preview 允许更大
 */
export function qzoneProxiedSrc(remoteUrl: string, kind: "thumb" | "preview" = "thumb"): string {
  if (!remoteUrl) return "";
  return `http://qzoneimg.localhost/?u=${encodeURIComponent(remoteUrl)}&k=${kind}`;
}

/**
 * 视频/大文件预览：Rust 落盘后返回绝对路径，前端再 convertFileSrc
 * 视频须传 albumId+assetId，后端走 floatview 取 MP4（列表 URL 常为封面/m3u8）
 */
export async function prepareQzonePreview(args: {
  url: string;
  albumId?: string;
  assetId?: string;
  mediaKind?: string;
}): Promise<string> {
  return invoke<string>("qzone_sync_prepare_preview", {
    url: args.url,
    albumId: args.albumId ?? null,
    assetId: args.assetId ?? null,
    mediaKind: args.mediaKind ?? null
  });
}

/**
 * 带 Cookie 代理媒体（仅灯箱等兜底；缩略图请用 qzoneProxiedSrc）
 * @param maxBytes 体积上限
 */
export async function fetchQzoneMediaDataUrl(url: string, maxBytes?: number): Promise<string> {
  const blob = await invoke<QzoneMediaBlob>("qzone_sync_fetch_media", {
    url,
    maxBytes: maxBytes ?? null
  });
  return `data:${blob.contentType};base64,${blob.dataBase64}`;
}

export async function getQzonePendingCount(): Promise<number> {
  return invoke<number>("qzone_sync_pending_count");
}
