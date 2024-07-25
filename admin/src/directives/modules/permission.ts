import type { App } from "vue";
import { useAuthStore } from "@/store/modules/auth";
import { intersection } from "lodash-es";
import { isArray } from "@/utils/is";

/**
 * @description: 判断是否有按钮权限
 * @param {string} value
 */
function hasPermission(value: string | string[]): boolean {
  const authStore = useAuthStore();
  const allCodeList = authStore.getPermCodeList as string[];
  if (!isArray(value)) {
    return allCodeList.includes(value);
  }
  return (intersection(value, allCodeList) as string[]).length > 0;
}

export default function vAuth(app: App) {
  app.directive("auth", {
    mounted: (el, binding) => {
      const value = binding.value;
      if (!value) return;
      if (!hasPermission(value)) {
        el.parentNode?.removeChild(el);
      }
    }
  });
}
