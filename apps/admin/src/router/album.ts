/**
 * CS 本机工具静态路由（本地相册 + iCloud 同步）
 * 职责：免登录；独立壳布局与 admin Layout 隔离；主窗内路由
 * 适用：CS 顶栏「本地相册」入口（含 iCloud 同步 Tab）
 */

import type { AppRouteRecordRaw } from "#/utils";

const AlbumLayout = () => import("@/layout/album.vue");

/** 本地相册路由（独立壳，不进 admin 侧栏） */
export const albumConstantRoutes: AppRouteRecordRaw[] = [
  {
    path: "/album",
    name: "Album",
    component: AlbumLayout,
    hidden: true,
    redirect: "/album/gallery",
    meta: {
      title: "本地相册",
      breadcrumb: false
    },
    children: [
      {
        path: "/album/gallery",
        name: "AlbumGallery",
        component: () => import("@/views/album/index.vue"),
        meta: { title: "相册", noCache: true }
      },
      {
        path: "/album/icloudSync",
        name: "AlbumIcloudSync",
        component: () => import("@/views/album/icloudSync.vue"),
        meta: { title: "iCloud同步", noCache: true }
      },
      {
        path: "/album/settings",
        name: "AlbumSettings",
        component: () => import("@/views/album/settings.vue"),
        meta: { title: "设置", noCache: true }
      }
    ]
  }
];

/** 是否相册相关 path（路由守卫白名单） */
export function isAlbumPath(path: string): boolean {
  return path === "/album" || path.startsWith("/album/");
}
