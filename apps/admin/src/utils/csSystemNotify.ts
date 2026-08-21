/**
 * CS 用户提示统一门控（成功 / 告警 / 信息）
 * 职责：按窗口焦点与是否在关注页，选择 OS 通知、应用内 message 或页内 inline
 * 适用：iCloud 同步、工作日报等 CS 后台任务的前后台提示
 *
 * 规则：
 * 1. 窗口失焦 → OS 系统通知
 * 2. 窗口聚焦且不在关注页 → Ant Design message
 * 3. 窗口聚焦且在关注页 → inline（由页面 UI 负责，本模块不重复弹）
 */

import { message } from "ant-design-vue";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from "@tauri-apps/plugin-notification";

export type CsNotifyChannel = "os" | "msg" | "inline";

export type CsNotifyKind = "success" | "error" | "info";

export interface CsNotifyContext {
  /** 主窗口是否聚焦 */
  windowFocused: boolean;
  /** 当前路由 path */
  currentPath: string;
  /** 功能页 path；在该页时由页内 UI 展示 */
  attentionPath: string;
}

export interface CsNotifyPayload {
  title: string;
  body: string;
}

/**
 * 解析提示应走的通道
 */
export function resolveCsNotifyChannel(ctx: CsNotifyContext): CsNotifyChannel {
  if (!ctx.windowFocused) return "os";
  if (ctx.currentPath !== ctx.attentionPath) return "msg";
  return "inline";
}

/** @deprecated 使用 resolveCsNotifyChannel === 'os' */
export function shouldCsSystemNotify(ctx: CsNotifyContext): boolean {
  return resolveCsNotifyChannel(ctx) === "os";
}

let permissionReady: boolean | null = null;

async function ensureNotifyPermission(): Promise<boolean> {
  if (permissionReady === true) return true;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    permissionReady = granted;
    return granted;
  } catch {
    return false;
  }
}

/**
 * 发送 OS 级系统通知（不再做通道判定）
 */
export async function notifyCsSystem(payload: CsNotifyPayload): Promise<void> {
  if (!(await ensureNotifyPermission())) return;
  try {
    await sendNotification({
      title: payload.title,
      body: payload.body
    });
  } catch (e) {
    console.warn("cs system notify failed:", e);
  }
}

function showCsMessage(kind: CsNotifyKind, payload: CsNotifyPayload) {
  const text = payload.body ? `${payload.title}：${payload.body}` : payload.title;
  if (kind === "success") {
    message.success(text);
  } else if (kind === "error") {
    message.error(text);
  } else {
    message.info(text);
  }
}

/**
 * 按统一规则投递用户提示（成功 / 失败 / 信息共用）
 * @returns 实际使用的通道；inline 表示未弹全局提示，由关注页自行展示
 */
export async function deliverCsNotify(
  ctx: CsNotifyContext,
  payload: CsNotifyPayload,
  kind: CsNotifyKind = "info"
): Promise<CsNotifyChannel> {
  const channel = resolveCsNotifyChannel(ctx);
  if (channel === "inline") return channel;
  if (channel === "os") {
    await notifyCsSystem(payload);
  } else {
    showCsMessage(kind, payload);
  }
  return channel;
}
