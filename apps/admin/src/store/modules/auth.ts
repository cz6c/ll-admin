import { defineStore } from "pinia";
import { setToken, removeToken } from "@/utils/auth";
import { login, getLoginUserInfo, refreshToken } from "@/api/public";
import type { LoginParams } from "#/api";
import type { UserVo } from "#/api/system/user.d";
import { usePermissionStore } from "@/store/modules/permission";
import { useTagsViewStore } from "@/store/modules/tagsView";
import router, { RouterEnum } from "@/router";
import $feedback from "@/utils/feedback";

interface authStoreState {
  userInfo: UserVo;
  userId: number;
  userName: string;
  avatar: string;
}

export const useAuthStore = defineStore("auth", {
  state: (): authStoreState => ({
    // 用户信息
    userInfo: null,
    userId: 0,
    userName: "",
    avatar: ""
  }),
  actions: {
    /**
     * @description: 登录
     * @param {LoginParams} loginParams
     * @return {*}
     */
    async login(loginParams: LoginParams): Promise<{ token: string }> {
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
        const { data } = await getLoginUserInfo();
        this.userInfo = data;
        this.userId = data.userId;
        this.userName = data.userName;
        this.avatar = data.avatar;
        return data;
      } catch (error) {
        return Promise.reject(error);
      }
    },

    /**
     * @description: 前端登出
     */
    webLogout() {
      removeToken();
      this.$reset();
      setTimeout(() => {
        usePermissionStore().$reset();
        useTagsViewStore().$reset();
        router.replace({
          name: RouterEnum.BASE_LOGIN_NAME,
          replace: true,
          query: {
            redirect: encodeURIComponent(router.currentRoute.value.fullPath)
          }
        });
      }, 500);
    },

    /** 刷新`token` */
    async handRefreshToken(data): Promise<{ token: string }> {
      return new Promise((resolve, reject) => {
        if (!data) {
          $feedback.message.error("登录失效");
          this.logOut();
          reject(null);
        }
        refreshToken(data)
          .then(res => {
            setToken(res.data.token);
            resolve(res.data);
          })
          .catch(error => {
            // 登录过期或权限变更处理
            $feedback.message.error("登录失效");
            this.webLogout();
            reject(error);
          });
      });
    }
  }
});
