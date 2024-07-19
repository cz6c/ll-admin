import type { App } from "vue";

// 该指令在点击目标元素之外的任意位置时触发
export default function vClickOutside(app: App) {
  app.directive("click-outside", {
    mounted(el, binding) {
      el.clickOutsideEvent = (event: Event) => {
        // 判断点击是否发生在元素之外
        if (!el.contains(event.target)) {
          binding.value(event); // 调用传进来的函数
        }
      };
      document.addEventListener("click", el.clickOutsideEvent);
    },
    unmounted(el) {
      document.removeEventListener("click", el.clickOutsideEvent);
    },
  });
}
