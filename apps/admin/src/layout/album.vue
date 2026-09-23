<!--
  本地相册独立壳（主窗内）
  职责：承载相册页路由；主题跟随 App 全局强制暗黑（不再嵌套暗黑岛）
  iCloud / QQ 空间同步已合并为相册页浮动触发区
-->
<script setup lang="ts">
defineOptions({ name: "AlbumLayout" });
</script>

<template>
  <div class="album-shell">
    <main class="shell-main">
      <router-view />
    </main>
  </div>
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
