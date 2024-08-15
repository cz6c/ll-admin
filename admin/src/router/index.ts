import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import type { App } from "vue";
import type { AppRouteRecordRaw } from "#/utils";
import { dynamicRoutes } from "./dynamicRoutes";
export const Layout = () => import("@/layout/index.vue");
export const IFrame = () => import("@/views/iframe/index.vue");

export enum RouterEnum {
  // login name
  BASE_LOGIN_NAME = "Login",
  // basic home name
  BASE_HOME_NAME = "Index",
  // redirect name
  BASE_REDIRECT_NAME = "Redirect"
}

// 公共菜单
const routesList: AppRouteRecordRaw[] = [
  // 根路由
  {
    path: "/",
    name: "Root",
    component: Layout,
    redirect: "/index",
    meta: {
      title: "首页",
      breadcrumb: false
    },
    children: [
      {
        path: "index",
        component: () => import("@/views/dashboard/index.vue"),
        name: RouterEnum.BASE_HOME_NAME,
        meta: { title: "首页", icon: "menu-iframe", affix: true }
      }
    ]
  },
  // 登录路由
  {
    path: "/login",
    name: RouterEnum.BASE_LOGIN_NAME,
    component: () => import("@/views/public/login.vue"),
    hidden: true,
    meta: {
      title: "login"
    }
  },
  {
    path: "/redirect",
    name: "RouterEnum.BASE_REDIRECT_NAME",
    component: Layout,
    hidden: true,
    children: [
      {
        path: "/redirect/:path(.*)",
        name: RouterEnum.BASE_REDIRECT_NAME,
        component: () => import("@/views/public/redirect.vue"),
        hidden: true
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    name: "PAGE_NOT_FOUND_NAME",
    component: () => import("@/views/public/404.vue"),
    hidden: true
  }
];

export const constantRoutes = [...routesList, ...dynamicRoutes] as RouteRecordRaw[];

// app router
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ left: 0, right: 0 }),
  routes: constantRoutes
});

// 白名单应该包含基本静态路由
const WHITE_NAME_LIST: string[] = [];
const getRouteNames = (array: any[]) =>
  array.forEach(item => {
    WHITE_NAME_LIST.push(item.name);
    getRouteNames(item.children || []);
  });
getRouteNames(constantRoutes);

/**
 * @description: 重置路由
 */
export function resetRouter() {
  router.getRoutes().forEach(route => {
    const { name } = route;
    if (name && !WHITE_NAME_LIST.includes(name as string)) {
      router.hasRoute(name) && router.removeRoute(name);
    }
  });
}

export default router;

// 配置路由器
export function setupRouter(app: App<Element>) {
  app.use(router);
}
