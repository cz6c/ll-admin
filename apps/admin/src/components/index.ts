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
// vue-tippy
import VueTippy from "vue-tippy";
import "tippy.js/dist/tippy.css";
import "tippy.js/themes/light.css";

// components目录以外的组件导入注册
const components = [];

function install(app: App<Element>) {
  // 组件循环注册
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
      // 这里可以设置全局默认props
      appendTo: () => document.body,
      interactive: true, // 可交互
      theme: "dark", // dark / light
      maxWidth: 500,
      zIndex: 9999
      // 其他默认选项
    }
  });
}
