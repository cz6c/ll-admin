/**
 * CS 本机工具静态路由（工作日报 + 应用设置）
 * 职责：免登录；独立壳布局与 admin Layout 隔离；主窗内路由，不新开窗口
 * 适用：CS 顶栏「工作日报」/ 右侧设置按钮 / 托盘进入
 */

import type { AppRouteRecordRaw } from "#/utils";

const DailyReportLayout = () => import("@/layout/dailyReport.vue");

/** 工作日报路由（独立壳，不进 admin 侧栏） */
export const dailyReportConstantRoutes: AppRouteRecordRaw[] = [
  {
    path: "/daily-report",
    name: "DailyReport",
    component: DailyReportLayout,
    hidden: true,
    redirect: "/daily-report/today",
    meta: {
      title: "工作日报",
      breadcrumb: false
    },
    children: [
      {
        path: "/daily-report/today",
        name: "DailyReportToday",
        component: () => import("@/views/dailyReport/index.vue"),
        meta: { title: "今日日报", noCache: true }
      },
      {
        path: "/daily-report/history",
        name: "DailyReportHistory",
        component: () => import("@/views/dailyReport/history.vue"),
        meta: { title: "日报历史", noCache: false }
      },
      {
        path: "/daily-report/settings",
        name: "DailyReportSettings",
        component: () => import("@/views/dailyReport/settings.vue"),
        meta: { title: "日报设置", noCache: false }
      }
    ]
  },
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

/** 是否日报相关 path（路由守卫白名单） */
export function isDailyReportPath(path: string): boolean {
  return path === "/daily-report" || path.startsWith("/daily-report/");
}

/** 是否 CS 应用设置 path */
export function isCsSettingsPath(path: string): boolean {
  return path === "/cs-settings" || path.startsWith("/cs-settings/");
}

/** CS 本机工具免登录白名单（日报 + 应用设置） */
export function isCsPublicPath(path: string): boolean {
  return isDailyReportPath(path) || isCsSettingsPath(path);
}

/**
 * 登录成功后的 redirect 清洗：CS 工具页免登录，不应抢后台落地页
 * @returns 可用后台 path；若为 CS 工具 path 则回首页 `/`
 */
export function sanitizePostLoginRedirect(raw: string): string {
  if (!raw || isCsPublicPath(raw)) return "/";
  return raw;
}
