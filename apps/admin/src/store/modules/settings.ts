import { defineStore } from "pinia";
import { handleThemeStyle } from "@/utils/theme";
import { WebStorage } from "@/utils/storage";

const layoutSetting = new WebStorage("localStorage").getItem("layout-setting") || {};

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    theme: layoutSetting.theme === undefined ? "#292ae4" : layoutSetting.theme, // 主题色
    tagsView: layoutSetting.tagsView === undefined ? true : layoutSetting.tagsView, // 是否显示 tagsView
    sidebarLogo: layoutSetting.sidebarLogo === undefined ? true : layoutSetting.sidebarLogo // 是否显示logo
  }),
  actions: {
    // 修改布局设置
    changeSetting(data: { key: string; value: string | boolean }) {
      const { key, value } = data;
      if (this.hasOwnProperty(key)) {
        this[key] = value;
        switch (key) {
          case "theme":
            // 设置主题色
            handleThemeStyle(value);
            break;
        }
      }
    }
  }
});
