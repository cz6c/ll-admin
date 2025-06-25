import type { App } from "vue";
import tab from "@/utils/tab";

export function installPlugins(app: App<Element>) {
  // 页签操作
  app.config.globalProperties.$tab = tab;
}

// 类型扩展
export {};

declare module "vue" {
  export interface ComponentCustomProperties {
    $tab: typeof tab;
  }
}
