import { h, defineComponent, type Component } from "vue";
import type { IconProps } from "@iconify/vue";
import IconifyIcon from "@/components/IconifyIcon/index.vue";

/**
 * 通过函数创建图标组件（@iconify/vue）
 * @param icon 图标名，统一使用 ant-design:xxx
 * @param options Iconify 可选属性（宽高请写这里；模板 attrs 也会合并进来）
 */
export function useRenderIcon(icon: string, options?: Omit<IconProps, "icon">): Component {
  return defineComponent({
    name: "Icon",
    inheritAttrs: false,
    setup(_, { attrs }) {
      return () => {
        if (!icon) return null;
        return h(IconifyIcon, {
          icon,
          ...options,
          ...attrs
        });
      };
    }
  });
}
