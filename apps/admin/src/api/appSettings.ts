/**
 * CS 应用级设置 API
 * 职责：开机自启、关闭到托盘、AI 接入（Base URL / Model / Key）的 Tauri invoke
 * 适用：顶栏应用设置页
 */

import { invoke } from "@tauri-apps/api/core";

/** 应用级本机配置（不含 API Key） */
export interface AppSettings {
  /** 关闭窗口时隐藏到托盘 */
  minimizeToTrayOnClose: boolean;
  /** 开机自启 */
  autostart: boolean;
  /** OpenAI 兼容 Chat Completions Base URL */
  modelBaseUrl: string;
  /** 模型名 */
  modelName: string;
  /** 无提交时是否仍调 AI（流水线当前固定不调） */
  callAiWhenEmpty: boolean;
}

/** 读取应用设置 */
export function getAppSettings() {
  return invoke<AppSettings>("app_settings_get");
}

/** 保存应用设置并同步自启插件 */
export function saveAppSettings(settings: AppSettings) {
  return invoke<void>("app_settings_save", { settings });
}

/**
 * 写入 AI API Key（OS 钥匙串）
 */
export function setAppAiApiKey(key: string) {
  return invoke<void>("app_settings_set_ai_api_key", { key });
}

/** 是否已配置 AI API Key */
export function hasAppAiApiKey() {
  return invoke<boolean>("app_settings_has_ai_api_key");
}
