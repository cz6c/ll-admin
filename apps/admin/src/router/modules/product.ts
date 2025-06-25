import type { AppRouteRecordRaw } from "@/router";
import { Layout } from "@/router";

export default {
  path: "/product",
  name: "product",
  component: Layout,
  meta: {
    title: "产品中心",
    icon: "menu-product",
    orderNo: 2
  },
  redirect: "/product/spu",
  children: [
    {
      path: "/product/spu",
      name: "Spu",
      component: () => import("@/views/product/spu/index.vue"),
      meta: {
        title: "商品管理"
      }
    },
    {
      path: "/product/spuForm",
      name: "SpuForm",
      component: () => import(`@/views/product/spu/spuForm/index.vue`),
      meta: {
        title: "编辑商品",
        activeMenu: "/product/spu",
        hideMenu: true
      }
    },
    {
      path: "/product/category",
      name: "Category",
      component: () => import(`@/views/product/category/index.vue`),
      meta: {
        title: "分类管理"
      }
    }
    // {
    //   path: "/product/specification",
    //   name: "Specification",
    //   component: () => import(`@/views/product/specification/index.vue`),
    //   meta: {
    //     title: "规格管理",
    //   },
    // },
  ]
} as AppRouteRecordRaw;
