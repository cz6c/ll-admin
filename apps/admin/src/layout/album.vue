<!--
  本地相册独立壳（主窗内）
  职责：与 admin Layout 隔离；二级 Tab（相册 / iCloud同步 / 设置）
  适用：CS 顶栏「本地相册」进入后的子导航
-->
<script setup lang="ts">
defineOptions({ name: "AlbumLayout" });

const route = useRoute();
const tabs = [
  { path: "/album/gallery", title: "相册", hint: "浏览照片和视频" },
  { path: "/album/icloudSync", title: "iCloud同步", hint: "从 iCloud 图库下载到本地" },
  { path: "/album/settings", title: "设置", hint: "相册根目录与 iCloud 落盘路径" }
];
</script>

<template>
  <div class="album-shell">
    <header class="shell-header">
      <nav class="tabs" aria-label="相册分区">
        <router-link v-for="tab in tabs" :key="tab.path" :to="tab.path" class="tab" :class="{ active: route.path === tab.path }" :title="tab.hint">
          {{ tab.title }}
        </router-link>
      </nav>
    </header>
    <main class="shell-main">
      <router-view v-slot="{ Component }">
        <Transition name="tab-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped lang="scss">
.album-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--fill-color);
}
.shell-header {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: var(--bg-color, #fff);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}
.tab {
  position: relative;
  padding: 8px 16px;
  border-radius: 6px;
  color: rgba(0, 0, 0, 0.65);
  text-decoration: none;
  font-size: 14px;
  transition:
    color 0.12s ease,
    background 0.12s ease;
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg);
  }
  &.active {
    color: var(--color-primary);
    font-weight: 600;
    background: var(--color-primary-bg);
  }
}
.shell-main {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 0;
}
</style>
