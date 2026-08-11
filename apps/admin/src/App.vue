<template>
  <el-config-provider :locale="zhCn">
    <div class="app-root" :class="{ 'is-cs': isCs }">
      <CsToolsBar v-if="isCs" />
      <div class="app-body">
        <router-view />
      </div>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { ElConfigProvider } from "element-plus";
import zhCn from "element-plus/dist/locale/zh-cn.mjs";
import CsToolsBar from "@/components/CsToolsBar/index.vue";
import { isTauri } from "@/utils/tauri";

defineOptions({
  name: "App"
});

const router = useRouter();
const isCs = isTauri();

/** 托盘等壳层事件 → 主窗内路由（不新开窗口） */
function resolveAppNavigate(raw: string): string {
  switch (raw) {
    case "today":
      return "/daily-report/today";
    case "history":
      return "/daily-report/history";
    case "settings":
      return "/daily-report/settings";
    case "app-settings":
      return "/cs-settings";
    case "admin":
      return "/index";
    default:
      return raw.startsWith("/") ? raw : "/daily-report/today";
  }
}

onMounted(async () => {
  if (!isCs) return;
  document.documentElement.classList.add("cs-shell");
  const { listen } = await import("@tauri-apps/api/event");
  listen<string>("app:navigate", event => {
    router.push(resolveAppNavigate(String(event.payload || "today")));
  });
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("cs-shell");
});
</script>

<style scoped lang="scss">
.app-root {
  height: 100%;
  &.is-cs {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
}
.app-body {
  position: relative;
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
</style>
