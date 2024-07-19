import type { App } from "vue";
// elementui
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

/**
 * @description: 公共业务组件
 */
// 图片
import BaseImage from "@/components/BaseImage/index.vue";

const components = [BaseImage];

function install(app: App<Element>) {
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }
  // 组件循环注册
  components.forEach(component => {
    console.log("🚀 ~ install ~ component:", component);
    app.component(component.options ? component.options.name : component.name, component);
  });
}

export function registerGlobComp(app: App) {
  app.use({ install });
}
