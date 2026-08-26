/**
 * CS 本机工具静态路由（应用设置）+ 路径白名单
 * 职责：免登录；独立壳布局与 admin Layout 隔离；主窗内路由，不新开窗口
 * 适用：右侧设置按钮 / 托盘进入
 */

import type { AppRouteRecordRaw } from "#/utils";
import { isAlbumPath } from "@/router/album";
import { isIcloudSyncPath } from "@/router/icloudSync";

/** CS 应用设置路由（独立壳，不进 admin 侧栏） */
export const csPublicConstantRoutes: AppRouteRecordRaw[] = [
  {
    path: "/cs-settings",
    name: "CsAppSettings",
    component: () => import("@/views/csSettings/index.vue"),
    hidden: true,
    meta: {
      title: "应用设置",
      breadcrumb: false,
      noCache: true
    }
  }
];

/** 是否 CS 应用设置 path（路由守卫白名单） */
export function isCsSettingsPath(path: string): boolean {
  return path === "/cs-settings" || path.startsWith("/cs-settings/");
}

/** CS 本机工具免登录白名单（应用设置 + 相册 + iCloud 同步） */
export function isCsPublicPath(path: string): boolean {
  return isCsSettingsPath(path) || isAlbumPath(path) || isIcloudSyncPath(path);
}

/**
 * 登录成功后的 redirect 清洗：CS 工具页免登录，不应抢后台落地页
 * @returns 可用后台 path；若为 CS 工具 path 则回首页 `/`
 */
export function sanitizePostLoginRedirect(raw: string): string {
  if (!raw || isCsPublicPath(raw)) return "/";
  return raw;
}
