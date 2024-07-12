import { defineStore } from "pinia";
import store from "@/store";
import { setToken, removeToken } from "@/utils/auth";
import { login, getInfo, logout } from "@/api/public";
import { LoginParams } from "@/api/public/index.d";
import { UserItem } from "@/api/system/user/index.d";
import { resetRouter } from "@/router";
import type { AppRouteRecordRaw } from "@/router/type";
import { useMultiTagsStore } from "./multiTags";
import { filterTree } from "@/utils/tree";

interface authStoreState {
  userInfo: UserItem;
  roles: string[];
  permissions: string[];
  dynamicRoutes: AppRouteRecordRaw[];
}

export const authStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户信息
    userInfo: null,
    // 角色权限
    roles: [],
    // 按钮级权限
    permissions: [],
    // 动态菜单
    dynamicRoutes: [],
  }),
  getters: {
    getDynamicMenu(): AppRouteRecordRaw[] {
      return filterTree(this.dynamicRoutes, route => {
        return !route.meta?.hideMenu;
      });
    },
    getDynamicRoutes(): AppRouteRecordRaw[] {
      return this.dynamicRoutes;
    },
    getPermCodeList(): string[] {
      return this.permissions;
    },
  },
  actions: {
    /**
     * @description: 登录
     * @param {LoginParams} loginParams
     * @return {*}
     */
    async login(loginParams: LoginParams): Promise<string | unknown> {
      try {
        const { data } = await login(loginParams);
        setToken(data.token);
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    /**
     * @description: 获取用户信息
     * @returns
     */
    async getLoginUserInfo() {
      try {
        const { data } = await getInfo();
        this.userInfo = data.user;
        this.roles = data.roles;
        this.permissions = data.permissions;
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    /**
     * @description: 获取菜单
     * @return {*}
     */
    // async getMenuListAction(): Promise<AppRouteRecordRaw[] | unknown> {
    //   try {
    //     let routeList: AppRouteRecordRaw[] = [];
    //     // if (productConfig.isDynamicAddedRoute) {
    //     //   const { data } = await getMenuList();
    //     //   routeList = menuToRoute(data.list);
    //     // } else {
    //     //   routeList = await getStaticRoutes();
    //     // }
    //     // 重置路由
    //     resetRouter();
    //     routeList.forEach(route => {
    //       router.addRoute(route as RouteRecordRaw);
    //     });
    //     // 对菜单进行排序
    //     routeList.sort((a, b) => {
    //       return (a.meta?.orderNo || 0) - (b.meta?.orderNo || 0);
    //     });
    //     this.dynamicRoutes = routeList;
    //     return routeList;
    //   } catch (error) {
    //     return Promise.reject(error);
    //   }
    // },

    /**
     * @description: 前端登出
     */
    async webLogout() {
      await logout();
      this.$reset();
      removeToken();
      resetRouter();
      const { resetState } = useMultiTagsStore();
      resetState();
    },
  },
});

export function useAuthStore() {
  return authStore(store);
}
