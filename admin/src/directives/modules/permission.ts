import type { App, Directive, DirectiveBinding } from "vue";
import { useAuthStore } from "@/store/modules/auth";
import { intersection } from "lodash-es";
import { isArray } from "@/utils/is";

const authStore = useAuthStore();

/**
 * @description: 判断是否有按钮权限
 * @param {string} value
 * @return {*}
 */
function hasPermission(value: string | string[]): boolean {
  const allCodeList = authStore.getPermCodeList as string[];
  if (!isArray(value)) {
    return allCodeList.includes(value);
  }
  return (intersection(value, allCodeList) as string[]).length > 0;
}

const mounted = (el: Element, binding: DirectiveBinding<any>) => {
  const value = binding.value;
  if (!value) return;
  if (!hasPermission(value)) {
    el.parentNode?.removeChild(el);
  }
};

const authDirective: Directive = {
  mounted,
};

export function setupPermissionDirective(app: App) {
  app.directive("auth", authDirective);
}

export default authDirective;
