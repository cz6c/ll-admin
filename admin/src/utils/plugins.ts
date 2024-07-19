import type { App } from "vue";
import tab from "./tab";
import modal from "./modal";

export function installPlugins(app: App<Element>) {
  // 页签操作
  app.config.globalProperties.$tab = tab;
  // 模态框对象
  app.config.globalProperties.$modal = modal;
}
