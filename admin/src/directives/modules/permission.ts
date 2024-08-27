import type { App } from "vue";
import { intersection } from "lodash-es";
import { isArray } from "@/utils/is";
import router from "@/router";

/**
 * @description: 判断是否有按钮级权限
 * @param {string} value
 */
function hasPermission(value: string | string[]): boolean {
  const perms = router.currentRoute.value.meta.perms as string[];
  if (!isArray(value)) {
    return perms.includes(value);
  }
  return (intersection(value, perms) as string[]).length > 0;
}

export default function vAuth(app: App) {
  app.directive("auth", {
    mounted: (el, binding) => {
      const value = binding.value;
      if (value) {
        if (!hasPermission(value)) {
          el.parentNode && el.parentNode.removeChild(el);
        }
      } else {
        throw new Error(`请设置功能权限标识`);
      }
    }
  });
}
