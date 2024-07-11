import type { AppRouteRecordRaw } from "@/router/type";
import { Layout } from "@/router";

export default {
  path: "/system",
  name: "System",
  component: Layout,
  meta: {
    title: "组织架构",
    icon: "menu-system",
    orderNo: 6,
  },
  redirect: "/system/user",
  children: [
    {
      path: "/system/user",
      name: "User",
      component: () => import("@/views/system/user/index.vue"),
      meta: {
        title: "用户管理",
      },
    },
    // {
    //   path: "/system/role",
    //   name: "Role",
    //   component: () => import(`@/views/system/role/index.vue`),
    //   meta: {
    //     title: "角色管理",
    //   },
    // },
    // {
    //   path: "/system/auth",
    //   name: "Auth",
    //   component: () => import(`@/views/system/auth/index.vue`),
    //   meta: {
    //     title: "按钮权限",
    //   },
    // },
  ],
} as AppRouteRecordRaw;
