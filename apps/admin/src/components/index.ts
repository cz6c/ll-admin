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
}
