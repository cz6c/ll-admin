<!--
  本地相册独立壳（主窗内）
  职责：承载相册页路由；强制暗黑主题岛（ConfigProvider darkAlgorithm + html.album-theme-dark）；
  iCloud / QQ 空间同步已合并为相册页浮动触发区
-->
<script setup lang="ts">
import { theme } from "ant-design-vue";
import { useSettingsStore } from "@/store/modules/settings";
import {
  FONT_FAMILY,
  DARK_COLOR_TEXT,
  DARK_COLOR_TEXT_SECONDARY,
  DARK_COLOR_TEXT_TERTIARY,
  DARK_COLOR_TEXT_DISABLED
} from "@/utils/theme";
import "@/assets/style/albumDark.scss";

defineOptions({ name: "AlbumLayout" });

const settingsStore = useSettingsStore();

/**
 * 相册页嵌套暗黑算法。
 * 必须显式覆盖 colorText*：App 根 ConfigProvider 写死了浅色黑字，嵌套只会 merge，不覆盖则抽屉/表单黑字贴深底。
 */
const albumAntdTheme = computed(() => ({
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: settingsStore.theme || "#1688ff",
    borderRadius: 8,
    fontFamily: FONT_FAMILY,
    colorText: DARK_COLOR_TEXT,
    colorTextSecondary: DARK_COLOR_TEXT_SECONDARY,
    colorTextTertiary: DARK_COLOR_TEXT_TERTIARY,
    colorTextDisabled: DARK_COLOR_TEXT_DISABLED,
    colorTextPlaceholder: "rgba(255, 255, 255, 0.4)",
    colorBgContainer: "#1f1f1f",
    colorBgElevated: "#1f1f1f",
    colorBgLayout: "#141414"
  }
}));

onMounted(() => {
  document.documentElement.classList.add("album-theme-dark");
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("album-theme-dark");
});
</script>

<template>
  <a-config-provider :theme="albumAntdTheme">
    <div class="album-shell">
      <main class="shell-main">
        <router-view />
      </main>
    </div>
  </a-config-provider>
</template>

<style scoped lang="scss">
.album-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--fill-color);
  color: var(--color-text);
}
.shell-main {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>
