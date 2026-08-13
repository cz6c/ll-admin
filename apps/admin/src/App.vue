<template>
  <a-config-provider :locale="zhCN" :theme="antdTheme">
    <div class="app-root" :class="{ 'is-cs': isCs }">
      <CsToolsBar v-if="isCs" />
      <div class="app-body">
        <router-view />
      </div>
    </div>
  </a-config-provider>
</template>

<script setup lang="ts">
import zhCN from "ant-design-vue/es/locale/zh_CN";
import { message, notification } from "ant-design-vue";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import CsToolsBar from "@/components/CsToolsBar/index.vue";
import { useSettingsStore } from "@/store/modules/settings";
import { isTauri } from "@/utils/tauri";

dayjs.locale("zh-cn");

defineOptions({
  name: "App"
});

const router = useRouter();
const isCs = isTauri();
const settingsStore = useSettingsStore();

/** Ant Design 主题 token：跟随 settings.theme */
const antdTheme = computed(() => ({
  token: {
    colorPrimary: settingsStore.theme || "#1688ff",
    borderRadius: 8
  }
}));

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

/**
 * CS 顶栏占位：message/notification 用 inline top，需与 --cs-shell-bar-height 对齐
 * （全屏遮罩类偏移见 antd.scss）
 */
function syncCsOverlayOffset() {
  const barH =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 44;
  message.config({ top: barH + 8 });
  notification.config({ top: barH + 24 });
}

onMounted(async () => {
  if (!isCs) return;
  document.documentElement.classList.add("cs-shell");
  syncCsOverlayOffset();
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
    height: 100%;
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
