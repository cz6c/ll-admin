import { RouterEnum } from "@/router";
import { unref } from "vue";
import { useRouter, type Router } from "vue-router";

/**
 * @description: 重新加载页面
 */
export function useRedo(router?: Router) {
  const { replace, currentRoute } = router || useRouter();
  const { query, params = {}, name, fullPath } = unref(currentRoute);
  function redo(): Promise<boolean> {
    return new Promise(resolve => {
      if (name === RouterEnum.REDIRECT_NAME) {
        resolve(false);
        return;
      }
      if (name && Object.keys(params).length > 0) {
        params["_origin_params"] = JSON.stringify(params ?? {});
        params["_redirect_type"] = "name";
        params["path"] = String(name);
      } else {
        params["_redirect_type"] = "path";
        params["path"] = fullPath;
      }
      replace({ name: RouterEnum.REDIRECT_NAME, params, query }).then(() => resolve(true));
    });
  }
  return { redo };
}
