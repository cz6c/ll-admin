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
  background: #16181d;
}
.shell-header {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: #1f2329;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}
.tab {
  padding: 8px 16px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.55);
  text-decoration: none;
  font-size: 14px;
  transition:
    color 0.12s ease,
    background 0.12s ease;
  &:hover {
    color: rgba(255, 255, 255, 0.88);
    background: rgba(255, 255, 255, 0.06);
  }
  &.active {
    color: #fff;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.1);
  }
}
.shell-main {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
</style>
