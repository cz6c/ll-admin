import { defineStore } from "pinia";
import { setToken, removeToken } from "@/utils/auth";
import { login, getLoginUserInfo, refreshToken } from "@/api/public";
import type { LoginParams } from "#/api";
import type { UserVo } from "#/api/system/user.d";
import { usePermissionStore } from "@/store/modules/permission";
import { useTagsViewStore } from "@/store/modules/tagsView";
import router, { RouterEnum } from "@/router";
import { isCsPublicPath } from "@/router/csPublic";
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
     * 前端登出
     * @param redirectPath 登录成功后回跳路径；不传则取当前路由。
     * @note 须由守卫传入 `to.fullPath`：未登录点「后台」时 currentRoute 仍可能是工具页，
     *       误把 redirect 写成工具页地址会导致登录后跳回工具页
     */
    webLogout(redirectPath?: string) {
      removeToken();
      this.$reset();
      const raw = redirectPath ?? router.currentRoute.value.fullPath;
      // 应用设置为免登录工具页，不应作为后台登录回跳目标
      const redirect = !raw || raw.startsWith("/login") || isCsPublicPath(raw) ? "/" : raw;
      setTimeout(() => {
        usePermissionStore().$reset();
        useTagsViewStore().$reset();
        router.replace({
          name: RouterEnum.BASE_LOGIN_NAME,
          replace: true,
          query: {
            redirect: encodeURIComponent(redirect)
          }
        });
      }, 500);
    },

    /** 刷新`token` */
    async handRefreshToken(data): Promise<{ token: string }> {
      return new Promise((resolve, reject) => {
        if (!data) {
          $feedback.message.error("登录失效");
          this.webLogout();
          reject(null);
          return;
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
