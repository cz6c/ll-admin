<!--
  CS 顶栏菜单
  职责：一级入口「后台」「工作日报」；右侧「应用设置」带文字，降低迷路
  适用：Tauri 主窗顶栏
-->
<script setup lang="ts">
import { useRenderIcon } from "@/hooks/useRenderIcon";
import { isCsSettingsPath, isDailyReportPath } from "@/router/dailyReport";

defineOptions({ name: "CsToolsBar" });

const router = useRouter();
const route = useRoute();

const isDailyActive = computed(() => isDailyReportPath(route.path));
const isSettingsActive = computed(() => isCsSettingsPath(route.path));
const isAdminActive = computed(() => !isDailyReportPath(route.path) && !isCsSettingsPath(route.path));

function openDailyReport() {
  router.push("/daily-report/today");
}

function openAdmin() {
  router.push("/index");
}

function openCsSettings() {
  router.push("/cs-settings");
}
</script>

<template>
  <header class="cs-top-bar">
    <div class="left">
      <nav class="menu" aria-label="主入口">
        <button type="button" class="menu-item" :class="{ active: isAdminActive }" @click="openAdmin">后台</button>
        <button type="button" class="menu-item" :class="{ active: isDailyActive }" @click="openDailyReport">工作日报</button>
      </nav>
    </div>
    <button
      type="button"
      class="settings-btn"
      :class="{ active: isSettingsActive }"
      title="应用设置（开机自启、托盘、AI）"
      aria-label="应用设置"
      @click="openCsSettings"
    >
      <component :is="useRenderIcon('ep:setting')" width="20px" height="20px" />
    </button>
  </header>
</template>

<style scoped lang="scss">
.cs-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 14px;
  flex-shrink: 0;
  background: #1f2329;
  color: rgba(255, 255, 255, 0.88);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 2000;
}
.left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.menu {
  display: flex;
  align-items: center;
  gap: 2px;
}
.menu-item {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  &.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
}
.context-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  &.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
}
</style>
