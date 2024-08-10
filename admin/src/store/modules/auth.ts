import { defineStore } from "pinia";
import { setToken, removeToken } from "@/utils/auth";
import { login, getInfo, logout } from "@/api/public";
import type { LoginParams } from "#/api";
import type { UserItem } from "@/api/system1/user/index.d";

interface authStoreState {
  userInfo: UserItem;
  userId: number;
  username: string;
  avatar: string;
  roles: string[];
  permissions: string[];
}

export const useAuthStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户信息
    userInfo: null,
    userId: 0,
    username: "",
    avatar: "",
    // 角色权限
    roles: [],
    // 按钮级权限
    permissions: []
  }),
  getters: {
    getPermCodeList(): string[] {
      return this.permissions;
    }
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
        this.userId = data.user.userId;
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
     * @description: 前端登出
     */
    async webLogout() {
      this.userId && (await logout());
      this.$reset();
      removeToken();
    }
  }
});
