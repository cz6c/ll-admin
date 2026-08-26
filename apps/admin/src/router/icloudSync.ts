/**
 * iCloud 同步旧路由兼容（已合并进本地相册）
 * 职责：将历史 /icloudSync/* 书签重定向到 /album/*
 */

import type { AppRouteRecordRaw } from "#/utils";

/** 旧 iCloud 独立壳路由 → 相册内对应页 */
export const icloudSyncConstantRoutes: AppRouteRecordRaw[] = [
  {
    path: "/icloudSync",
    redirect: "/album/gallery",
    hidden: true
  },
  {
    path: "/icloudSync/sync",
    redirect: "/album/gallery",
    hidden: true
  },
  {
    path: "/icloudSync/auth",
    redirect: "/album/gallery",
    hidden: true
  },
  {
    path: "/icloudSync/settings",
    redirect: "/cs-settings",
    hidden: true
  }
];

/** @deprecated 已合并进 isAlbumPath；保留供旧代码引用 */
export function isIcloudSyncPath(path: string): boolean {
  return path === "/icloudSync" || path.startsWith("/icloudSync/");
}
