<template>
  <div :class="classObj" class="app-wrapper">
    <div v-if="device === 'mobile' && sidebar.opened" class="drawer-bg" @click="handleClickOutside" />
    <aside class="sidebar-container">
      <Sidebar />
    </aside>
    <div :class="{ hasTagsView: needTagsView }" class="main-container">
      <header class="layout-header">
        <Navbar @setLayout="setLayout" @toggleClick="toggleSideBar" />
      </header>
      <TagsView v-if="needTagsView" />
      <section class="app-main">
        <div class="app-main-scroll">
          <AppMain />
        </div>
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
  mobile: device.value === "mobile"
}));

const { width } = useWindowSize();
const WIDTH = 992; // refer to Bootstrap's responsive design

watchEffect(() => {
  if (width.value - 1 < WIDTH) {
    layoutStore.toggleDevice("mobile");
    layoutStore.closeSideBar();
  } else {
    layoutStore.toggleDevice("desktop");
  }
});

function toggleSideBar() {
  layoutStore.toggleSideBar();
}

function handleClickOutside() {
  layoutStore.closeSideBar();
}
</script>
