import { RouterEnum } from "@/router";
import { useAuthStore } from "@/store/modules/auth";
import { usePermissionStore } from "@/store/modules/permission";
import { getToken } from "@/utils/auth";
import type { Router } from "vue-router";
import nProgress from "nprogress";
import { ElMessage, ElNotification } from "element-plus";
import { productConfig } from "@/config";
import constRoutes from "@/router/local";
import { getRouters } from "@/api/public";

/**
 * @description:  创建项目前置权限
 * @param {Router} router
 */
function setupPermissionGuard(router: Router) {
  // 不需要token的白名单
  const whitePathList: string[] = [RouterEnum.BASE_LOGIN_PATH];

  router.beforeEach(async (to, from, next) => {
    console.log(to, from);
    const permissionStore = usePermissionStore();
    const authStore = useAuthStore();
    const token = getToken();

    // 没有接口本地调试时开启
    // if (to.matched.length > 0 && to.matched[0].name !== "PAGE_NOT_FOUND_NAME" && permissionStore.addRoutes.length) {
    //   next();
    // } else {
    //   let data = constRoutes;
    //   if (productConfig.isDynamicAddedRoute) {
    //     // 向后端请求路由数据
    //     const res = await getRouters();
    //     data = res.data;
    //   }
    //   permissionStore.generateRoutes(data);
    //   next({ path: to.fullPath, replace: true });
    // }

    // 验证token
    if (token) {
      if (to.path === RouterEnum.BASE_LOGIN_PATH) {
        return next((to.query?.redirect as string) || RouterEnum.BASE_HOME_PATH);
      }
      // 验证用户权限
      if (!authStore.userId) {
        try {
          await authStore.getLoginUserInfo();
          // 是否已经生成过动态路由
          // if (permissionStore.addRoutes.length === 0) {
          let data = constRoutes;
          if (productConfig.isDynamicAddedRoute) {
            // 向后端请求路由数据
            const res = await getRouters();
            data = res.data;
          }
          permissionStore.generateRoutes(data);
          next({ path: to.fullPath, replace: true });
          // } else {
          //   next();
          // }
        } catch (error) {
          // 登录过期或登录无效，前端登出
          await useAuthStore().webLogout();
          next({
            path: RouterEnum.BASE_LOGIN_PATH,
            query: { redirect: to.fullPath },
            replace: true
          });
        }
      } else {
        next();
      }
    } else {
      if (whitePathList.includes(to.path)) {
        return next();
      } else {
        // 无权限，前端登出
        await useAuthStore().webLogout();
        next({
          path: RouterEnum.BASE_LOGIN_PATH,
          query: { redirect: to.fullPath },
          replace: true
        });
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
