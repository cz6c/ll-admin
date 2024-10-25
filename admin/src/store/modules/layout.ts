import { defineStore } from "pinia";

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    sidebar: {
      opened: true
    },
    device: "desktop"
  }),
  actions: {
    // 切换侧边栏
    toggleSideBar() {
      this.sidebar.opened = !this.sidebar.opened;
    },
    // 关闭侧边栏
    closeSideBar() {
      this.sidebar.opened = false;
    },
    // 切换设备类型
    toggleDevice(device: "mobile" | "desktop") {
      this.device = device;
    }
  }
});
