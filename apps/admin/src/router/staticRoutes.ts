/**
 * 本地静态路由（不进侧栏）
 * 职责：菜单栏动态路由以外的页面，并入 constantRoutes，登录即可访问
 * 适用：个人中心等 Navbar/站内跳转入口，不依赖角色菜单分配
 */
import type { AppRouteRecordRaw } from "#/utils";

const Layout = () => import("@/layout/index.vue");

/** 静态隐藏页：勿写入 sys_menu */
export const staticRoutes: AppRouteRecordRaw[] = [
  {
    path: "/user",
    name: "UserStatic",
    component: Layout,
    hidden: true,
    meta: {
      title: "用户",
      breadcrumb: false
    },
    children: [
      {
        path: "profile",
        name: "Profile",
        component: () => import("@/views/system/user/profile/index.vue"),
        hidden: true,
        meta: {
          title: "个人中心",
          noCache: true
        }
      }
    ]
  }
];

export default staticRoutes;
