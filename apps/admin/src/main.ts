import { createApp } from "vue";
import App from "./App.vue";
import { setupStore } from "@/store";
import router, { setupRouter } from "@/router";
import { setupRouterGuard } from "@/router/guard";
import { registerGlobComp } from "@/components";
import { setupGlobDirectives } from "@/directives";
import { installPlugins } from "@/plugins";
import "@/utils/sso";
import MQTTClientSingleton from "@/utils/mqtt";
// 带重试机制的发布
MQTTClientSingleton.safePublish("前端");

import { isArray } from "@llcz/common";
console.log(isArray([]));

// css
import "normalize.css";
// 引入重置样式
import "@/assets/style/reset.scss";
import "@/assets/style/index.scss";

// unocss
import "virtual:uno.css";

import { addPreventDefault } from "@/utils/preventDefault";

const isProd = process.env.NODE_ENV === "production";
isProd && addPreventDefault();

const app = createApp(App);

// 全局方法挂载
installPlugins(app);

// 配置store
setupStore(app);

// 配置路由
setupRouter(app);

// 配置路由守卫
setupRouterGuard(router);

// 注册全局组件
registerGlobComp(app);

// 注册全局指令
setupGlobDirectives(app);

app.mount("#app");
