import type { App } from "vue";
// 图片裁剪
import VueCropper from "vue-cropper";
import "vue-cropper/dist/index.css";
// VxeTable
import { lazyVxeTable } from "./vxeTable";
import "vxe-table/styles/cssvar.scss";
import "vxe-table/lib/style.css";
import "vxe-pc-ui/styles/cssvar.scss";
import "vxe-pc-ui/lib/style.css";
/** 须在 VXE cssvar 之后：暗黑色板桥接到全局 token */
import "@/assets/style/vxeThemeBridge.scss";
// vue-tippy
import VueTippy from "vue-tippy";
import "tippy.js/dist/tippy.css";
import "tippy.js/themes/light.css";

/**
 * 第三方 / 插件级全局注册（VXE、Tippy、Cropper）
 * `src/components` 下业务 .vue 由 unplugin-vue-components 按需 auto-import，勿在此重复注册
 * @see build/vite/plugins/component.ts · vue-admin.mdc「组件自动引入」
 */
const components = [];

function install(app: App<Element>) {
  components.forEach(component => {
    app.component(component.name, component);
  });
}

export function registerGlobComp(app: App) {
  app.use({ install });
  app.use(VueCropper);
  app.use(lazyVxeTable);
  app.use(VueTippy, {
    defaultProps: {
      appendTo: () => document.body,
      interactive: true,
      theme: "dark",
      maxWidth: 500,
      zIndex: 9999
    }
  });
}
