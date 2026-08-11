<!--
  工作日报独立壳（主窗内）
  职责：与 admin Layout 隔离；二级 Tab（今日 / 历史 / 设置）
  适用：CS 顶栏「工作日报」进入后的子导航
-->
<script setup lang="ts">
defineOptions({ name: "DailyReportLayout" });

const route = useRoute();
const tabs = [
  { path: "/daily-report/today", title: "今日", hint: "生成与查看" },
  { path: "/daily-report/history", title: "历史", hint: "按日回看" },
  { path: "/daily-report/settings", title: "设置", hint: "工作区与计划" }
];
</script>

<template>
  <div class="daily-report-shell">
    <header class="shell-header">
      <nav class="tabs" aria-label="日报分区">
        <router-link
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          class="tab"
          :class="{ active: route.path === tab.path }"
          :title="tab.hint"
        >
          {{ tab.title }}
        </router-link>
      </nav>
    </header>
    <main class="shell-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped lang="scss">
.daily-report-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page, #f5f7fa);
}
.shell-header {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: var(--el-bg-color, #fff);
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 14px;
  transition:
    color 0.12s ease,
    background 0.12s ease;
  &:hover {
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  &.active {
    color: var(--el-color-primary);
    font-weight: 600;
    background: var(--el-color-primary-light-9);
  }
}
.shell-main {
  flex: 1;
  overflow: auto;
  padding: 12px;
  min-height: 0;
}
</style>
