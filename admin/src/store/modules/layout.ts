import { defineStore } from "pinia";
import store from "@/store";

interface layoutStore {
  isCollapse: boolean;
}

export const layoutStore = defineStore("layout", {
  state: (): layoutStore => ({
    // Sidebar 折叠
    isCollapse: false,
  }),
  getters: {
    getIsCollapse(): boolean {
      return this.isCollapse;
    },
  },
  actions: {
    setIsCollapse(flag: boolean) {
      this.isCollapse = flag;
    },
  },
});

export function useLayoutStore() {
  return layoutStore(store);
}
