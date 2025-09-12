<template>
  <div class="side-bar">
    <div v-if="sidebarLogo" class="logo-container">
      <div class="logo-link">
        <LogoSvgCom width="26px" height="26px" />
        <span v-if="sidebar.opened" class="sidebar-title">{{ productConfig.title }}</span>
      </div>
    </div>
    <div class="side-menu">
      <el-scrollbar wrap-class="scrollbar-wrapper">
        <el-menu mode="vertical" :default-active="getActiveRoutePath" :collapse-transition="false" :unique-opened="true" :collapse="!sidebar.opened">
          <SidebarItem v-for="(route, index) in routes" :key="route.path + index" :item="route" />
        </el-menu>
      </el-scrollbar>
    </div>
    <div class="code-info">
      <div v-if="sidebar.opened" class="des">技术支持：cz6</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import SidebarItem from "./components/SidebarItem.vue";
import { useLayoutStore } from "@/store/modules/layout";
import { usePermissionStore } from "@/store/modules/permission";
import { useSettingsStore } from "@/store/modules/settings";
import LogoSvgCom from "@/assets/svg/logo.svg?component";
import { productConfig } from "@/config";

defineOptions({
  name: "Sidebar"
});

const routes = computed(() => usePermissionStore().routes);
const sidebar = computed(() => useLayoutStore().sidebar);
const sidebarLogo = computed(() => useSettingsStore().sidebarLogo);

const router = useRouter();
const getActiveRoutePath = computed((): string => {
  const currentRoute = router.currentRoute.value;
  return (currentRoute.meta.activeMenu as string) || currentRoute.path;
});
</script>

<style lang="scss" scoped>
.side-bar {
  height: 100%;
  width: 100%;

  .logo-container {
    position: relative;
    height: 50px;
    width: 100%;

    .logo-link {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: #000000;

      .sidebar-title {
        display: inline-block;
        font-size: 18px;
        font-weight: 600;
        height: 32px;
        line-height: 32px;
        margin: 2px 0 0 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .side-menu {
    height: calc(100% - 94px);
    overflow: hidden;
  }

  .code-info {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 44px;
    font-size: 12px;
    color: var(--el-color-info);
  }
}
</style>
