import { createRouter, createWebHistory, createWebHashHistory } from "vue-router";
import type { RouteRecordRaw, RouterHistory } from "vue-router";
import type { App } from "vue";
import type { AppRouteRecordRaw } from "#/utils";
export const Layout = () => import("@/layout/index.vue");
export const IFrame = () => import("@/layout/iframe/index.vue");

export enum RouterEnum {
  // login name
  BASE_LOGIN_NAME = "Login",
  // basic home name
  BASE_HOME_NAME = "Index",
  // redirect name
  BASE_REDIRECT_NAME = "Redirect",
  // 404
  BASE_NOT_FOUND_NAME = "NOT_FOUND"
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
        path: "/index",
        component: () => import("@/views/dashboard/index.vue"),
        name: RouterEnum.BASE_HOME_NAME,
        meta: { title: "首页", icon: "ep:home-filled", affix: true, noCache: true }
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
    path: "/test",
    name: "Test",
    component: () => import("@/views/public/test.vue"),
    hidden: true,
    meta: {
      title: "test"
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
    name: RouterEnum.BASE_NOT_FOUND_NAME,
    component: () => import("@/views/public/404.vue"),
    hidden: true
  }
];

export const constantRoutes = [...routesList] as RouteRecordRaw[];

/** 获取路由历史模式 https://next.router.vuejs.org/zh/guide/essentials/history-mode.html */
function getHistoryMode(routerHistory): RouterHistory {
  // len为1 代表只有历史模式 为2 代表历史模式中存在base参数 https://next.router.vuejs.org/zh/api/#%E5%8F%82%E6%95%B0-1
  const historyMode = routerHistory.split(",");
  const leftMode = historyMode[0];
  const rightMode = historyMode[1];
  // no param
  if (historyMode.length === 1) {
    if (leftMode === "hash") {
      return createWebHashHistory("");
    } else if (leftMode === "h5") {
      return createWebHistory("");
    }
  } //has param
  else if (historyMode.length === 2) {
    if (leftMode === "hash") {
      return createWebHashHistory(rightMode);
    } else if (leftMode === "h5") {
      return createWebHistory(rightMode);
    }
  }
}

// app router
const router = createRouter({
  history: getHistoryMode(import.meta.env.VITE_ROUTER_HISTORY),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return to.hash ? { behavior: "smooth", el: to.hash } : { top: 0, left: 0 };
    }
  },
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
