import { defineStore } from "pinia";
import { setToken, removeToken } from "@/utils/auth";
import { login, getInfo, logout } from "@/api/public";
import { LoginParams } from "#/api";
import { UserItem } from "@/api/system1/user/index.d";

interface authStoreState {
  userInfo: UserItem;
  username: string;
  avatar: string;
  roles: string[];
  permissions: string[];
}

export const useAuthStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户信息
    userInfo: null,
    username: "",
    avatar: "",
    // 角色权限
    roles: [],
    // 按钮级权限
    permissions: [],
  }),
  getters: {
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
        this.username = data.user.username;
        this.avatar = data.user.avatar;
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
    },
  },
});
