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
import { useDailyReportBackgroundNotify } from "@/composables/useDailyReportBackgroundNotify";
import { useIcloudSyncBackgroundNotify } from "@/composables/useIcloudSyncBackgroundAlert";
import { useSettingsStore } from "@/store/modules/settings";
import { isTauri, ensureCsWindowMinInnerSize } from "@/utils/tauri";
import { FONT_FAMILY, COLOR_TEXT, COLOR_TEXT_SECONDARY, COLOR_TEXT_TERTIARY, COLOR_TEXT_DISABLED } from "@/utils/theme";

dayjs.locale("zh-cn");

defineOptions({
  name: "App"
});

const router = useRouter();
const isCs = isTauri();
const settingsStore = useSettingsStore();

useIcloudSyncBackgroundNotify();
useDailyReportBackgroundNotify();

/** Ant Design 主题 token：跟随 settings.theme；字族/字色与 theme.scss 统一 */
const antdTheme = computed(() => ({
  token: {
    colorPrimary: settingsStore.theme || "#1688ff",
    borderRadius: 8,
    fontFamily: FONT_FAMILY,
    colorText: COLOR_TEXT,
    colorTextSecondary: COLOR_TEXT_SECONDARY,
    colorTextTertiary: COLOR_TEXT_TERTIARY,
    colorTextDisabled: COLOR_TEXT_DISABLED
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
    case "album":
      return "/album/gallery";
    case "icloudSync":
      return "/album/icloudSync";
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
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 34;
  message.config({ top: barH + 8 });
  notification.config({ top: barH + 24 });
}

onMounted(async () => {
  if (!isCs) return;
  document.documentElement.classList.add("cs-shell");
  syncCsOverlayOffset();
  // 先卡客户区下限，再挂导航监听，避免启动瞬间可缩到外框 min 以下
  await ensureCsWindowMinInnerSize();
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
