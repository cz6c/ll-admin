import { defineStore } from "pinia";
import store from "@/store";
import { setToken, removeToken } from "@/utils/auth";
import { login, getMenuList, getPermCodeList } from "@/api/public";
import { getLoginUserInfoApi } from "@/api/system/user";
import { LoginParams } from "@/api/public/index.d";
import { UserItem } from "@/api/system/user/index.d";
import { productConfig } from "@/config";
import router, { resetRouter } from "@/router";
import { menuToRoute, getStaticRoutes } from "@/router/utils";
import type { RouteRecordRaw } from "vue-router";
import type { AppRouteRecordRaw } from "@/router/type";
import { useMultiTagsStore } from "./multiTags";
import { filterTree } from "@/utils/tree";

interface authStoreState {
  id: string;
  username: string;
  avatar: string;
  dynamicRoutes: AppRouteRecordRaw[];
  permCodeList: string[];
}

export const authStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户id
    id: 0,
    // 用户昵称
    username: "",
    // 用户头像
    avatar: "",
    // 动态菜单
    dynamicRoutes: [],
    // 按钮级权限
    permCodeList: ["1000"],
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
      return this.permCodeList;
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
        await this.getLoginUserInfoAction();
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    /**
     * @description: 获取用户信息
     * @return {*}
     */
    async getLoginUserInfoAction(): Promise<UserItem | unknown> {
      try {
        const { data } = await getLoginUserInfoApi();
        const { id, username, avatar } = data;
        this.id = id;
        this.username = username;
        this.avatar = avatar;
        await this.getMenuListAction();
        if (productConfig.isPermCode) {
          await this.getPermCodeListAction();
        }
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    /**
     * @description: 获取菜单
     * @return {*}
     */
    async getMenuListAction(): Promise<AppRouteRecordRaw[] | unknown> {
      try {
        let routeList: AppRouteRecordRaw[] = [];
        if (productConfig.isDynamicAddedRoute) {
          const { data } = await getMenuList();
          routeList = menuToRoute(data.list);
        } else {
          routeList = await getStaticRoutes();
        }
        // 重置路由
        resetRouter();
        routeList.forEach(route => {
          router.addRoute(route as RouteRecordRaw);
        });
        // 对菜单进行排序
        routeList.sort((a, b) => {
          return (a.meta?.orderNo || 0) - (b.meta?.orderNo || 0);
        });
        this.dynamicRoutes = routeList;
        return routeList;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    /**
     * @description: 获取按钮权限
     */
    setPermCodeList(data: string[]) {
      this.permCodeList = data;
    },
    async getPermCodeListAction(): Promise<string[] | unknown> {
      try {
        const { data } = await getPermCodeList();
        this.setPermCodeList(data);
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },

    /**
     * @description: 前端登出
     */
    async webLogout() {
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
