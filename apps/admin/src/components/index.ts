import type { App } from "vue";
// elementui
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
// 图片裁剪
import VueCropper from "vue-cropper";
import "vue-cropper/dist/index.css";
// VxeTable
import { lazyVxeTable } from "./vxeTable";
import "vxe-table/styles/cssvar.scss";
import "vxe-table/lib/style.css";
import "vxe-pc-ui/styles/cssvar.scss";
import "vxe-pc-ui/lib/style.css";

/**
 * @description: 公共业务组件
 */
// 图片
import BaseImage from "@/components/BaseImage/index.vue";
import IconifyIcon from "@/components/IconifyIcon/index.vue";

const components = [BaseImage, IconifyIcon];

function install(app: App<Element>) {
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }
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
