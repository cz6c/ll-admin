import { productConfig } from "@/config";

const { sideTheme, showSettings, topNav, tagsView, fixedHeader, sidebarLogo, dynamicTitle } = productConfig;

const storageSetting = JSON.parse(localStorage.getItem("layout-setting")) || "";

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    title: "",
    theme: storageSetting.theme || "#409EFF",
    sideTheme: storageSetting.sideTheme || sideTheme,
    showSettings: showSettings,
    topNav: storageSetting.topNav === undefined ? topNav : storageSetting.topNav,
    tagsView: storageSetting.tagsView === undefined ? tagsView : storageSetting.tagsView,
    fixedHeader: storageSetting.fixedHeader === undefined ? fixedHeader : storageSetting.fixedHeader,
    sidebarLogo: storageSetting.sidebarLogo === undefined ? sidebarLogo : storageSetting.sidebarLogo,
    dynamicTitle: storageSetting.dynamicTitle === undefined ? dynamicTitle : storageSetting.dynamicTitle,
  }),
  actions: {
    // 修改布局设置
    changeSetting(data) {
      const { key, value } = data;
      if (this.hasOwnProperty(key)) {
        this[key] = value;
      }
    },
  },
});
