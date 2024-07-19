import { RouterEnum } from "@/router";
import { useAuthStore } from "@/store/modules/auth";
import { usePermissionStore } from "@/store/modules/permission";
import { getToken } from "@/utils/auth";
import type { Router } from "vue-router";
import nProgress from "nprogress";
import { ElMessage, ElNotification } from "element-plus";
import { productConfig } from "@/config";
import { getStaticRoutes } from "@/router/utils";

/**
 * @description:  创建项目前置权限
 * @param {Router} router
 */
function createPermissionGuard(router: Router) {
  const whitePathList: string[] = [RouterEnum.BASE_LOGIN_PATH];

  router.beforeEach(async (to, from, next) => {
    console.log(to, from);
    // 验证token
    if (getToken()) {
      if (to.path === RouterEnum.BASE_LOGIN_PATH) {
        next((to.query?.redirect as string) || "/");
      } else {
        // 验证用户权限
        if (useAuthStore().roles.length === 0) {
          try {
            await useAuthStore().getLoginUserInfo();
            if (productConfig.isDynamicAddedRoute) {
              await usePermissionStore().generateRoutes();
            } else {
              await getStaticRoutes();
            }
            next({ ...to, replace: true }); // hack方法 确保addRoutes已完成
          } catch (error) {
            // 登录过期或登录无效时，前端登出
            await useAuthStore().webLogout();
            next({
              path: RouterEnum.BASE_LOGIN_PATH,
              replace: true,
              query: {
                redirect: `${to.fullPath}`,
              },
            });
          }
        } else {
          next();
        }
      }
    } else {
      // 白名单
      if (whitePathList.includes(to.path)) {
        next();
      } else {
        next({
          path: RouterEnum.BASE_LOGIN_PATH,
          replace: true,
          query: {
            redirect: `${to.fullPath}`,
          },
        });
      }
    }
  });
}

/**
 * @description: 创建 NProgress
 * @param {Router} router
 */
function createProgressGuard(router: Router) {
  router.beforeEach(async to => {
    if (to.meta.loaded) {
      return true;
    }
    nProgress.start();
    return true;
  });

  router.afterEach(async () => {
    nProgress.done();
    return true;
  });
}

/**
 * @description: 路由切换时关闭消息实例
 * @param {Router} router
 */
function createMessageGuard(router: Router) {
  router.beforeEach(async () => {
    try {
      ElMessage.closeAll();
      ElNotification.closeAll();
    } catch (error) {
      console.log("message guard error:" + error);
    }
    return true;
  });
}

/**
 * @description: 动态title
 * @param {Router} router
 */
function createTitleGuard(router: Router) {
  const BASE_TITLE = productConfig.title;
  router.beforeEach(async to => {
    document.title = to.meta.title ? `${to.meta.title} | ${BASE_TITLE}` : `${BASE_TITLE}`;
    return true;
  });
}

export function setupRouterGuard(router: Router) {
  createMessageGuard(router);
  createProgressGuard(router);
  createTitleGuard(router);
  createPermissionGuard(router);
}
