import type { App } from "vue";
// elementui
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

/**
 * @description: 公共业务组件
 */
// 图片
import BaseImage from "@/components/BaseImage/index.vue";

const components = [
  {
    name: "BaseImage",
    component: BaseImage,
  },
];

function install(app: App<Element>) {
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }
  // 组件循环注册
  components.forEach(({ name, component }) => {
    app.component(name, component);
  });
}

export function registerGlobComp(app: App) {
  app.use({ install });
}
