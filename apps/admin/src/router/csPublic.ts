/**
 * CS 本机工具路径白名单
 * 职责：相册等免登录页的路由守卫与登录 redirect 清洗
 * 适用：guard / auth / login；应用设置见 useCsSettingsModal 全局弹窗
 */

import { isAlbumPath } from "@/router/album";

/** CS 本机工具免登录白名单（相册等） */
export function isCsPublicPath(path: string): boolean {
  return isAlbumPath(path);
}

/**
 * 登录成功后的 redirect 清洗：CS 工具页免登录，不应抢后台落地页
 * @returns 可用后台 path；若为 CS 工具 path 则回首页 `/`
 */
export function sanitizePostLoginRedirect(raw: string): string {
  if (!raw || isCsPublicPath(raw)) return "/";
  return raw;
}
