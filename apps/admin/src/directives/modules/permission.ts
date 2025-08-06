import type { App } from "vue";
import { intersection } from "lodash-es";
import { isArray } from "@llcz/common";
import router from "@/router";
import { useAuthStore } from "@/store/modules/auth";

/**
 * @description: 判断是否有按钮级权限
 * @param {string} value
 */
export function hasPermission(value: string | string[]): boolean {
  if (value === "default") return true; // 默认code不处理
  const userStore = useAuthStore();
  if (userStore.userId === 1) return true; // 超级管理员不处理
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
