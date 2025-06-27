import { createRouter, createWebHashHistory } from "vue-router";
import router, { constantRoutes, Layout, IFrame } from "@/router";
import { cloneDeep, omit } from "lodash-es";
import { isArray, isHttp } from "@packages/common";
import type { AppRouteRecordRaw } from "#/utils";

// 匹配views里面所有的.vue文件
const modules = import.meta.glob("./../../views/**/*.vue");

interface permissionState {
  routes: AppRouteRecordRaw[];
  addRoutes: AppRouteRecordRaw[];
}

export const usePermissionStore = defineStore("permission", {
  state: (): permissionState => ({
    routes: [],
    addRoutes: []
  }),
  actions: {
    generateRoutes(data) {
      this.addRoutes = data;
      const sdata = JSON.parse(JSON.stringify(data));
      const asyncRoutes = menuToRoute(sdata);
      asyncRoutes.forEach(route => {
        if (!isHttp(route.path)) {
          router.addRoute(route); // 动态添加可访问路由表
        }
      });
      this.routes = constantRoutes.concat(asyncRoutes);
    }
  },
  persist: {
    storage: sessionStorage
  }
});

function menuToRoute(routeList) {
  const routes = filterAsyncRouter(routeList);
  return flatMultiLevelRoutes(routes);
}

// 遍历后台传来的路由字符串，转换为组件对象
function filterAsyncRouter(asyncRouterMap) {
  return asyncRouterMap.filter(route => {
    if (route.component) {
      if (route.component === "Layout") {
        route.component = Layout;
      } else if (route.component === "InnerLink") {
        route.component = IFrame;
      } else {
        route.component = loadView(route.component);
      }
    }
    if (isArray(route.children) && route.children.length) {
      route.children = filterAsyncRouter(route.children);
    } else {
      delete route["children"];
      delete route["redirect"];
    }
    return true;
  });
}

// 加载路由组件
const loadView = (view: string) => {
  let res = null;
  for (const path in modules) {
    const dir = path.split("views/")[1].split(".vue")[0];
    if (dir === view) {
      res = modules[path];
      continue;
    }
  }
  return res;
};

/**
 * @description: 将多级路由转换为 2 级路由
 */
export function flatMultiLevelRoutes(routeModules) {
  const modules = cloneDeep(routeModules);
  for (let index = 0; index < modules.length; index++) {
    const routeModule = modules[index];
    // 判断级别是否多级路由
    if (!isMultipleRoute(routeModule)) {
      // 声明终止当前循环， 即跳过此次循环，进行下一轮
      continue;
    }
    // 路由等级提升
    promoteRouteLevel(routeModule);
  }
  return modules;
}

/**
 * @description: 路由等级提升
 */
function promoteRouteLevel(routeModule) {
  // 使用vue-router拼接菜单
  // createRouter 创建一个可以被 Vue 应用程序使用的路由实例
  let router = createRouter({
    routes: [routeModule],
    history: createWebHashHistory()
  });
  // getRoutes： 获取所有 路由记录的完整列表。
  const routes = router.getRoutes();
  // 将所有子路由添加到二级路由
  addToChildren(routes, routeModule.children || [], routeModule);
  router = null;
  // omit lodash的函数 对传入的item对象的children进行删除
  routeModule.children = routeModule.children?.map(item => omit(item, "children"));
}

/**
 * @description: 将所有子路由添加到二级路由
 */
function addToChildren(routes, children, routeModule) {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const route = routes.find(item => item.name === child.name);
    if (!route) {
      continue;
    }
    routeModule.children = routeModule.children || [];
    if (!routeModule.children.find(item => item.name === route.name)) {
      routeModule.children?.push(route);
    }
    if (child.children?.length) {
      addToChildren(routes, child.children, routeModule);
    }
  }
}

/**
 * @description: 判断级别是否超过2级
 * @return {*}
 */
function isMultipleRoute(routeModule): boolean {
  // Reflect.has 与 in 操作符 相同, 用于检查一个对象(包括它原型链上)是否拥有某个属性
  if (!routeModule || !Reflect.has(routeModule, "children") || !routeModule.children?.length) {
    return false;
  }
  const children = routeModule.children;
  let flag = false;
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    if (child.children?.length) {
      flag = true;
      break;
    }
  }
  return flag;
}
