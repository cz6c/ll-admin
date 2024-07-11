import type { AppRouteRecordRaw } from "@/router/type";
import { Layout } from "@/router";

export default {
  path: "/dashboard",
  name: "Dashboard",
  component: Layout,
  meta: {
    title: "Dashboard",
    icon: "menu-dashboard",
    orderNo: 1,
  },
  redirect: "/dashboard/workbench",
  children: [
    {
      path: "/dashboard/workbench",
      name: "Workbench",
      component: () => import("@/views/dashboard/workbench/index.vue"),
      meta: {
        title: "工作台",
        affix: true,
      },
    },
  ],
} as AppRouteRecordRaw;
