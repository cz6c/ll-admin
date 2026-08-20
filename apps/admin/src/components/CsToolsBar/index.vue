<!--
  CS 顶栏（兼自定义标题栏）
  职责：左侧品牌（logo+标题）；主入口导航；右侧设置与窗口控制；中间拖拽区
  适用：Tauri 主窗 decorations:false 时
-->
<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRenderIcon } from "@/hooks/useRenderIcon";
import { productConfig } from "@/config";
import { isCsSettingsPath, isDailyReportPath } from "@/router/dailyReport";
import logo from "@/assets/images/logo.png";

defineOptions({ name: "CsToolsBar" });

const router = useRouter();
const route = useRoute();
const appWindow = getCurrentWindow();
const appTitle = productConfig.title || "Ccode";

const isDailyActive = computed(() => isDailyReportPath(route.path));
const isSettingsActive = computed(() => isCsSettingsPath(route.path));
const isAdminActive = computed(() => !isDailyReportPath(route.path) && !isCsSettingsPath(route.path));
/** 最大化态：切换还原图标，并随窗口尺寸变化同步 */
const isMaximized = ref(false);

let unlistenResize: (() => void) | undefined;

/**
 * 从系统窗口同步最大化状态（拖拽还原/双击标题栏后也需刷新）
 */
async function syncMaximized() {
  try {
    isMaximized.value = await appWindow.isMaximized();
  } catch {
    /* Web 预览无 window API 时忽略 */
  }
}

function openDailyReport() {
  router.push("/daily-report/today");
}

function openAdmin() {
  router.push("/index");
}

function openCsSettings() {
  router.push("/cs-settings");
}

/** 单击拖动窗口；双击切换最大化（替代系统标题栏习惯） */
async function onDragRegionMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  try {
    if (e.detail === 2) {
      await appWindow.toggleMaximize();
      await syncMaximized();
    } else {
      await appWindow.startDragging();
    }
  } catch {
    /* ignore */
  }
}

async function onMinimize() {
  try {
    await appWindow.minimize();
  } catch {
    /* ignore */
  }
}

async function onToggleMaximize() {
  try {
    await appWindow.toggleMaximize();
    await syncMaximized();
  } catch {
    /* ignore */
  }
}

/**
 * 关闭走 Tauri CloseRequested：若开启「关闭时最小化到托盘」则隐藏而非退出
 */
async function onClose() {
  try {
    await appWindow.close();
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await syncMaximized();
  try {
    unlistenResize = await appWindow.onResized(() => {
      void syncMaximized();
    });
  } catch {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  unlistenResize?.();
});
</script>

<template>
  <header class="cs-top-bar">
    <div class="left">
      <!-- 品牌区可拖：对齐系统标题栏「点住图标/标题拖窗」习惯 -->
      <div class="brand" :title="appTitle" @mousedown="onDragRegionMouseDown">
        <img class="brand-logo" :src="logo" width="22" height="22" alt="" />
        <span class="brand-title">{{ appTitle }}</span>
      </div>
      <nav class="menu" aria-label="主入口">
        <button type="button" class="menu-item" :class="{ active: isAdminActive }" @click="openAdmin">管理后台</button>
        <button type="button" class="menu-item" :class="{ active: isDailyActive }" @click="openDailyReport">工作日报</button>
      </nav>
    </div>

    <!-- 可拖区域与按钮分离，避免误触拖拽抢点击 -->
    <div class="drag-region" aria-hidden="true" title="拖动窗口" @mousedown="onDragRegionMouseDown" />

    <div class="right">
      <button
        type="button"
        class="icon-btn"
        :class="{ active: isSettingsActive }"
        title="应用设置（开机自启、托盘、AI）"
        aria-label="应用设置"
        @click="openCsSettings"
      >
        <component :is="useRenderIcon('ant-design:setting-outlined')" width="16px" height="16px" />
      </button>

      <div class="win-controls" aria-label="窗口控制">
        <button type="button" class="win-btn" title="最小化" aria-label="最小化" @click="onMinimize">
          <component :is="useRenderIcon('ant-design:minus-outlined')" width="14px" height="14px" />
        </button>
        <button type="button" class="win-btn" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原' : '最大化'" @click="onToggleMaximize">
          <component :is="useRenderIcon(isMaximized ? 'ant-design:switcher-outlined' : 'ant-design:border-outlined')" width="13px" height="13px" />
        </button>
        <button type="button" class="win-btn win-btn--close" title="关闭" aria-label="关闭" @click="onClose">
          <component :is="useRenderIcon('ant-design:close-outlined')" width="14px" height="14px" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped lang="scss">
.cs-top-bar {
  display: flex;
  align-items: stretch;
  height: var(--cs-tools-bar-height, 34px);
  padding: 0 0 0 10px;
  flex-shrink: 0;
  background: #1f2329;
  color: rgba(255, 255, 255, 0.88);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 2000;
  user-select: none;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-shrink: 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 180px;
  padding-right: 10px;
  cursor: default;
}
.brand-logo {
  display: block;
  flex-shrink: 0;
  border-radius: 5px;
  pointer-events: none;
}
.brand-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  line-height: 1.2;
  pointer-events: none;
}
.drag-region {
  flex: 1;
  min-width: 24px;
  cursor: default;
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
.right {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 34px;
  height: 30px;
  margin-right: 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  &.active {
    color: #fff;
    background: rgba(255, 255, 255, 0.14);
  }
}
.win-controls {
  display: flex;
  align-items: stretch;
}
.win-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  &:active {
    background: rgba(255, 255, 255, 0.16);
  }
}
.win-btn--close:hover {
  background: #e81123;
  color: #fff;
}
.win-btn--close:active {
  background: #c50f1f;
  color: #fff;
}
</style>
