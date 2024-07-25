import type { AppRouteRecordRaw } from "@/router";
import { Layout } from "@/router";

export default {
  path: "/member",
  name: "member",
  component: Layout,
  meta: {
    title: "会员中心",
    icon: "menu-member",
    orderNo: 4,
  },
  redirect: "/member/user",
  children: [
    {
      path: "/member/user",
      name: "MemberUser",
      component: () => import("@/views/member/user/index.vue"),
      meta: {
        title: "会员管理",
      },
    },
  ],
} as AppRouteRecordRaw;
