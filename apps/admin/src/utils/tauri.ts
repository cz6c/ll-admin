/**
 * Tauri CS 环境探测
 * 职责：区分 WebView 壳与浏览器，避免 bs 构建误挂本地能力
 * 适用：工作日报菜单/路由、invoke 前守卫
 */

/** 是否运行在 Tauri WebView（CS）内 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
