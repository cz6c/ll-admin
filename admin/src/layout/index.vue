<template>
  <div :class="classObj" class="app-wrapper">
    <div v-if="device === 'mobile' && sidebar.opened" class="drawer-bg" @click="handleClickOutside" />
    <el-aside class="sidebar-container">
      <Sidebar />
    </el-aside>
    <div :class="{ hasTagsView: needTagsView }" class="main-container">
      <el-header height="50px">
        <Navbar @setLayout="setLayout" @toggleClick="toggleSideBar" />
      </el-header>
      <TagsView v-if="needTagsView" />
      <section class="app-main">
        <el-scrollbar>
          <AppMain />
        </el-scrollbar>
      </section>
    </div>
    <Settings ref="settingRef" />
  </div>
</template>

<script setup lang="ts">
import AppMain from "./components/AppMain/index.vue";
import Sidebar from "./components/Sidebar/index.vue";
import Navbar from "./components/Navbar/index.vue";
import TagsView from "./components/TagsView/index.vue";
import Settings from "./components/Settings/index.vue";
import { useLayoutStore } from "@/store/modules/layout";
import { useSettingsStore } from "@/store/modules/settings";
import { useWindowSize } from "@vueuse/core";
import variables from "@/assets/style/variables.module.scss";
console.log("🚀 ~ variables:", variables);

defineOptions({
  name: "Layout"
});

const settingRef = ref(null);
function setLayout() {
  settingRef.value.openSetting();
}

const layoutStore = useLayoutStore();
const settingsStore = useSettingsStore();
const sidebar = computed(() => layoutStore.sidebar);
const device = computed(() => layoutStore.device);
const needTagsView = computed(() => settingsStore.tagsView);

const classObj = computed(() => ({
  collapseSidebar: !sidebar.value.opened,
  withoutAnimation: sidebar.value.withoutAnimation,
  mobile: device.value === "mobile"
}));

const { width } = useWindowSize();
const WIDTH = 992; // refer to Bootstrap's responsive design

watchEffect(() => {
  if (width.value - 1 < WIDTH) {
    layoutStore.toggleDevice("mobile");
    layoutStore.closeSideBar({ withoutAnimation: true });
  } else {
    layoutStore.toggleDevice("desktop");
  }
});

function toggleSideBar() {
  layoutStore.toggleSideBar();
}

function handleClickOutside() {
  layoutStore.closeSideBar({ withoutAnimation: false });
}
</script>

<style scoped lang="scss">
@import "@/assets/style/variables.module.scss";
@import "@/assets/style/mixin.scss";
.app-wrapper {
  @include clearfix;
  position: relative;
  height: 100%;
  width: 100%;
  background: #f7f7fb;

  .drawer-bg {
    background: #000;
    opacity: 0.3;
    width: 100%;
    top: 0;
    height: 100%;
    position: absolute;
    z-index: 999;
  }

  .main-container {
    height: 100%;
    transition: margin-left 0.28s;
    margin-left: $base-sidebar-width;
    position: relative;

    .el-header {
      background-color: #fff;
      border-bottom: 1px solid #d8dce5;
    }
    .app-main {
      /* 50= navbar  50  */
      min-height: calc(100vh - 50px);
      width: 100%;
      position: relative;
      overflow: hidden;
    }

    &.hasTagsView {
      .app-main {
        /* 84 = navbar + tags-view = 50 + 35 */
        min-height: calc(100vh - 85px);
      }
    }
  }
}
</style>
