import { RouterEnum } from "@/router";
import { useAuthStore } from "@/store/modules/auth";
import { usePermissionStore } from "@/store/modules/permission";
import { getToken } from "@/utils/auth";
import type { Router, RouteRecordRaw } from "vue-router";
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
    const authStore = useAuthStore();
    console.log(to, from);
    // 验证token
    if (getToken()) {
      console.log("有token");
      if (to.path === RouterEnum.BASE_LOGIN_PATH) {
        next((to.query?.redirect as string) || "/");
      } else {
        // 验证用户权限
        if (authStore.roles.length === 0) {
          try {
            await authStore.getLoginUserInfo();
            let accessRoutes: any = [];
            if (productConfig.isDynamicAddedRoute) {
              accessRoutes = await usePermissionStore().generateRoutes();
            } else {
              accessRoutes = await getStaticRoutes();
            }
            console.log("🚀 ~ router.beforeEach ~ accessRoutes:", accessRoutes);
            // 根据roles权限生成可访问的路由表
            // accessRoutes.forEach((route: RouteRecordRaw) => {
            //   // if (!isHttp(route.path)) {
            //   router.addRoute(route); // 动态添加可访问路由表
            //   // }
            // });
            console.log("动态添加路由");
            next({ ...to, replace: true }); // hack方法 确保addRoutes已完成
            // 动态添加路由后，此处应当重定向到fullPath，否则会加载404页面内容
            // next({ path: to.fullPath, replace: true, query: to.query });
          } catch (error) {
            console.log("登录过期或登录无效时，前端登出");
            // 登录过期或登录无效时，前端登出
            await authStore.webLogout();
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
  const BASE_TITLE = import.meta.env.VITE_APP_TITLE;
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
