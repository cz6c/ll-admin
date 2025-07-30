import { h, defineComponent, type Component } from "vue";
import type { IconProps } from "@iconify/vue";
import IconifyIcon from "@/components/IconifyIcon/index.vue";

/**
 * @description: 通过函数创建图标组件，支持iconify中所有的图标
 * @param {string} icon 必传 图标
 * @param {IconProps} options 可选属性
 * @return {*} Component
 */
export function useRenderIcon(icon: string, options?: Omit<IconProps, "icon">): Component {
  return defineComponent({
    name: "Icon",
    components: { IconifyIcon },
    render() {
      if (!icon) return;
      return h(
        IconifyIcon,
        {
          icon,
          ...options
        },
        {
          default: () => []
        }
      );
    }
  });
}
