import { createApp } from "vue";
import App from "./App.vue";
import { setupStore } from "@/store";
import router, { setupRouter } from "@/router";
import { setupRouterGuard } from "@/router/guard";
import { registerGlobComp } from "@/components";
import { setupGlobDirectives } from "@/directives";
import { installPlugins } from "@/utils/plugins";

// css
import "normalize.css";
import "@/assets/style/global.scss";

// 注册svg
import "virtual:svg-icons-register";

// unocss
import "virtual:uno.css";

import { useDict } from "@/hooks/dict";
import { parseTime, resetForm, addDateRange, handleTree, selectDictLabel, selectDictLabels } from "@/utils";

const app = createApp(App);

// 全局方法挂载
app.config.globalProperties.useDict = useDict;
app.config.globalProperties.parseTime = parseTime;
app.config.globalProperties.resetForm = resetForm;
app.config.globalProperties.handleTree = handleTree;
app.config.globalProperties.addDateRange = addDateRange;
app.config.globalProperties.selectDictLabel = selectDictLabel;
app.config.globalProperties.selectDictLabels = selectDictLabels;

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
