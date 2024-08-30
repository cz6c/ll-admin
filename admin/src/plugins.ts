import type { App } from "vue";
import tab from "@/utils/tab";
import message from "@/utils/message";
import modal from "@/utils/modal";

export function installPlugins(app: App<Element>) {
  // 页签操作
  app.config.globalProperties.$tab = tab;
  // 消息反馈对象
  app.config.globalProperties.$message = message;
  // 模态框对象
  app.config.globalProperties.$modal = modal;
}

// 类型扩展
export {};

declare module "vue" {
  export interface ComponentCustomProperties {
    $tab: typeof tab;
    $message: typeof message;
    $modal: typeof modal;
  }
}
