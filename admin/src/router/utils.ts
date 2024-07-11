import type { Router, RouteRecordNormalized } from "vue-router";
import { createRouter, createWebHashHistory } from "vue-router";
import type { AppRouteRecordRaw } from "@/router/type";
import { Layout, IFrame } from "@/router";
import { cloneDeep, omit } from "lodash-es";

const modulesRoutes = (import.meta as any).glob("/src/views/**/*.{vue,tsx}");
const modulesRoutesKeys = Object.keys(modulesRoutes);

export function menuToRoute(routeList: AppRouteRecordRaw[]): AppRouteRecordRaw[] {
  transformRoute(routeList);
  return flatMultiLevelRoutes(routeList);
}

/**
 * @description: 动态菜单转路由
 * @param {AppRouteRecordRaw[]} routeList
 */
export function transformRoute(routeList: AppRouteRecordRaw[]) {
  routeList.forEach(item => {
    const { component, children } = item;
    if (component === "Layout") {
      item.component = Layout;
      if (children && children.length) {
        item.redirect = children[0].path;
      }
    } else if (component === "IFrame") {
      item.component = IFrame;
    } else {
      const index = modulesRoutesKeys.findIndex(x => x.includes((component as string).replace(/@[\/]?views\//, "")));
      item.component = modulesRoutes[modulesRoutesKeys[index]];
    }
    children && transformRoute(children);
  });
}

/**
 * @description: 将多级路由转换为 2 级路由
 * @param {AppRouteRecordRaw[]} routeModules
 * @return {*}
 */
export function flatMultiLevelRoutes(routeModules: AppRouteRecordRaw[]): AppRouteRecordRaw[] {
  const modules: AppRouteRecordRaw[] = cloneDeep(routeModules);
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
 * @param {AppRouteRecordRaw} routeModule
 */
function promoteRouteLevel(routeModule: AppRouteRecordRaw) {
  // 使用vue-router拼接菜单
  // createRouter 创建一个可以被 Vue 应用程序使用的路由实例
  let router: Router | null = createRouter({
    routes: [routeModule as unknown as RouteRecordNormalized],
    history: createWebHashHistory(),
  });
  // getRoutes： 获取所有 路由记录的完整列表。
  const routes = router.getRoutes();
  // 将所有子路由添加到二级路由
  addToChildren(routes, routeModule.children || [], routeModule);
  router = null;
  // omit lodash的函数 对传入的item对象的children进行删除
  routeModule.children = routeModule.children?.map(item => omit(item, "children")) as AppRouteRecordRaw[];
}

/**
 * @description: 将所有子路由添加到二级路由
 * @param {RouteRecordNormalized} routes
 * @param {AppRouteRecordRaw} children
 * @param {AppRouteRecordRaw} routeModule
 */
function addToChildren(routes: RouteRecordNormalized[], children: AppRouteRecordRaw[], routeModule: AppRouteRecordRaw) {
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const route = routes.find(item => item.name === child.name);
    if (!route) {
      continue;
    }
    routeModule.children = routeModule.children || [];
    if (!routeModule.children.find(item => item.name === route.name)) {
      routeModule.children?.push(route as unknown as AppRouteRecordRaw);
    }
    if (child.children?.length) {
      addToChildren(routes, child.children, routeModule);
    }
  }
}

/**
 * @description: 判断级别是否超过2级
 * @param {AppRouteRecordRaw} routeModule
 * @return {*}
 */
function isMultipleRoute(routeModule: AppRouteRecordRaw): boolean {
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

/**
 * @description: 获取本地静态路由
 */
export async function getStaticRoutes(): Promise<AppRouteRecordRaw[]> {
  try {
    const files = (import.meta as any).glob("./modules/*.ts", { import: "default", eager: true });
    return Object.values(files);
  } catch (error) {
    console.log(error);
    return [];
  }
}
