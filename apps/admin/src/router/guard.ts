import { RouterEnum } from "@/router";
import { useAuthStore } from "@/store/modules/auth";
import { usePermissionStore } from "@/store/modules/permission";
import { getToken } from "@/utils/auth";
import type { Router } from "vue-router";
import nProgress from "nprogress";
import { ElMessage, ElNotification } from "element-plus";
import { productConfig } from "@/config";

/**
 * @description:  创建项目前置权限
 * @param {Router} router
 */
function setupPermissionGuard(router: Router) {
  // 不需要token的白名单
  const whitePathList: string[] = ["/login", "/test"];

  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore();
    const data = getToken();

    // 验证token
    if (data?.token) {
      if (to.name === RouterEnum.BASE_LOGIN_NAME) {
        return next({ path: to.query?.redirect ? decodeURIComponent(to.query.redirect as string) : "/" });
      }
      // 验证用户权限
      if (!authStore.userId) {
        try {
          await authStore.getLoginUserInfo();
          await usePermissionStore().initRouter();
          // 这里不能直接 `next({ ...to })`，因为首次刷新动态路由页面时，`to`
          // 可能已经被解析成 404 路由对象，继续展开会把 `name: NOT_FOUND`
          // 一并带上，导致注入完成后仍然命中 404。显式使用原始 path/query/hash
          // 重新匹配，才能让新注入的动态路由生效。
          return next({
            path: to.path,
            query: to.query,
            hash: to.hash,
            replace: true
          });
        } catch {
          // 登录过期或登录无效，前端登出
          useAuthStore().webLogout();
          return false;
        }
      } else {
        return next();
      }
    } else {
      if (whitePathList.includes(to.path)) {
        return next();
      } else {
        // 无权限，前端登出
        useAuthStore().webLogout();
        return false;
      }
    }
  });
}

/**
 * @description: 创建 通用路由守卫
 * @param {Router} router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();

  router.beforeEach(async to => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded) {
      nProgress.start();
    }

    // 动态title
    const BASE_TITLE = productConfig.title;
    document.title = to.meta.title ? `${to.meta.title} | ${BASE_TITLE}` : `${BASE_TITLE}`;

    // 路由切换时关闭消息实例
    try {
      ElMessage.closeAll();
      ElNotification.closeAll();
    } catch (error) {
      console.log("message guard error:" + error);
    }

    return true;
  });

  router.afterEach(async to => {
    nProgress.done();
    loadedPaths.add(to.path);
    return true;
  });
}

export function setupRouterGuard(router: Router) {
  setupCommonGuard(router);
  setupPermissionGuard(router);
}
