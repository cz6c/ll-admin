import type { AppRouteRecordRaw } from "@/router";
import { Layout } from "@/router";

export default {
  path: "/operation",
  name: "operation",
  component: Layout,
  meta: {
    title: "运营中心",
    icon: "menu-operation",
    orderNo: 5
  },
  redirect: "/operation/banner",
  children: [
    {
      path: "/operation/banner",
      name: "Banner",
      component: () => import("@/views/operation/banner/index.vue"),
      meta: {
        title: "轮播图管理"
      }
    }
  ]
} as AppRouteRecordRaw;
