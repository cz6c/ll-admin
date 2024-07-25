import type { AppRouteRecordRaw } from "@/router";
import { Layout } from "@/router";

export default {
  path: "/order",
  name: "order",
  component: Layout,
  meta: {
    title: "订单中心",
    icon: "menu-order",
    orderNo: 3,
  },
  redirect: "/order/list",
  children: [
    {
      path: "/order/list",
      name: "OrderList",
      component: () => import("@/views/order/list/index.vue"),
      meta: {
        title: "订单管理",
      },
    },
    {
      path: "/order/details",
      name: "OrderDetails",
      component: () => import(`@/views/order/list/orderDetails/index.vue`),
      meta: {
        title: "订单详情",
        activeMenu: "/order/list",
        hideMenu: true,
      },
    },
  ],
} as AppRouteRecordRaw;
