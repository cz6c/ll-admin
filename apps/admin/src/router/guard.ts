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
  const whitePathList: string[] = ["/login"];

  router.beforeEach(async (to, from, next) => {
    console.log(to, from);
    const permissionStore = usePermissionStore();
    const authStore = useAuthStore();
    const token = getToken();

    // 验证token
    if (token) {
      if (to.name === RouterEnum.BASE_LOGIN_NAME) {
        return next({ path: to.query?.redirect ? decodeURIComponent(to.query.redirect as string) : "/" });
      }
      // 验证用户权限
      if (!authStore.userId) {
        try {
          await authStore.getLoginUserInfo();
          permissionStore.initRouter().then(router => {
            // 确保动态路由完全加入路由列表并且不影响静态路由（注意：动态路由刷新时router.beforeEach可能会触发两次，第一次触发动态路由还未完全添加，第二次动态路由才完全添加到路由列表，如果需要在router.beforeEach做一些判断可以在to.name存在的条件下去判断，这样就只会触发一次）
            if (to.name === RouterEnum.BASE_NOT_FOUND_NAME) router.push(to.fullPath);
          });
          next();
        } catch (error) {
          // 登录过期或登录无效，前端登出
          useAuthStore().webLogout();
        }
      } else {
        next();
      }
    } else {
      if (whitePathList.includes(to.path)) {
        return next();
      } else {
        // 无权限，前端登出
        useAuthStore().webLogout();
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
