import { defineStore } from "pinia";
import Cookies from "js-cookie";

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    sidebar: {
      opened: Cookies.get("sidebarStatus") ? !!+Cookies.get("sidebarStatus") : true,
      withoutAnimation: false,
      hide: false,
    },
    device: "desktop",
  }),
  actions: {
    // 切换侧边栏
    toggleSideBar() {
      if (this.sidebar.hide) {
        return false;
      }
      this.sidebar.opened = !this.sidebar.opened;
      if (this.sidebar.opened) {
        Cookies.set("sidebarStatus", 1);
      } else {
        Cookies.set("sidebarStatus", 0);
      }
    },
    // 关闭侧边栏
    closeSideBar({ withoutAnimation }) {
      Cookies.set("sidebarStatus", 0);
      this.sidebar.opened = false;
      this.sidebar.withoutAnimation = withoutAnimation;
    },
    // 切换设备类型
    toggleDevice(device: "mobile" | "desktop") {
      this.device = device;
    },
  },
});
