import { defineStore } from "pinia";
import { setToken, removeToken } from "@/utils/auth";
import { login, getInfo, logout } from "@/api/public";
import type { LoginParams } from "#/api";
import type { SysUserData } from "#/api/system/user.d";
import { usePermissionStore } from "@/store/modules/permission";
import { useTagsViewStore } from "@/store/modules/tagsView";

interface authStoreState {
  userInfo: SysUserData;
  userId: number;
  username: string;
  avatar: string;
  roles: string[];
}

export const useAuthStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户信息
    userInfo: null,
    userId: 0,
    username: "",
    avatar: "",
    // 角色权限
    roles: []
  }),
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
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },

    /**
     * @description: 前端登出
     */
    webLogout() {
      this.userId && logout();
      removeToken();
      this.$reset();
      usePermissionStore().$reset();
      useTagsViewStore().$reset();
    }
  }
});
