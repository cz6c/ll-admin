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
import { theme } from "ant-design-vue";
import zhCN from "ant-design-vue/es/locale/zh_CN";
import { message, notification } from "ant-design-vue";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import CsToolsBar from "@/components/CsToolsBar/index.vue";
import { useIcloudSyncBackgroundNotify } from "@/composables/useIcloudSyncBackgroundAlert";
import { useSettingsStore } from "@/store/modules/settings";
import { isTauri, ensureCsWindowMinInnerSize } from "@/utils/tauri";
import {
  FONT_FAMILY,
  COLOR_PRIMARY,
  COLOR_TEXT,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  COLOR_TEXT_DISABLED,
  COLOR_TEXT_PLACEHOLDER,
  COLOR_BG_CONTAINER,
  COLOR_BG_LAYOUT,
  COLOR_BG_ELEVATED
} from "@/utils/theme";

dayjs.locale("zh-cn");

defineOptions({
  name: "App"
});

const router = useRouter();
const isCs = isTauri();
const settingsStore = useSettingsStore();

useIcloudSyncBackgroundNotify();

/**
 * 全局强制暗黑：darkAlgorithm + 显式浅色字 / 深色容器 token
 * （与 theme.scss :root 一致；色值只从 @/utils/theme 引入）
 */
const antdTheme = computed(() => ({
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: settingsStore.theme || COLOR_PRIMARY,
    borderRadius: 8,
    fontFamily: FONT_FAMILY,
    colorText: COLOR_TEXT,
    colorTextSecondary: COLOR_TEXT_SECONDARY,
    colorTextTertiary: COLOR_TEXT_TERTIARY,
    colorTextDisabled: COLOR_TEXT_DISABLED,
    colorTextPlaceholder: COLOR_TEXT_PLACEHOLDER,
    colorBgContainer: COLOR_BG_CONTAINER,
    colorBgElevated: COLOR_BG_ELEVATED,
    colorBgLayout: COLOR_BG_LAYOUT
  }
}));

/** 托盘等壳层事件 → 主窗内路由（不新开窗口） */
function resolveAppNavigate(raw: string): string {
  switch (raw) {
    case "app-settings":
      return "/cs-settings";
    case "admin":
      return "/index";
    case "album":
      return "/album/gallery";
    default:
      return raw.startsWith("/") ? raw : "/index";
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
    router.push(resolveAppNavigate(String(event.payload || "admin")));
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
