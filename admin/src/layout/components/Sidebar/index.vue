<template>
  <div class="side-bar">
    <div class="logo-container">
      <div class="logo-link">
        <Transition name="fade" mode="out-in">
          <SvgIcon v-if="sidebar.opened" name="logo" size="26" />
          <SvgIcon v-else name="logo" size="26" />
        </Transition>
      </div>
    </div>
    <div class="side-menu">
      <el-scrollbar wrap-class="scrollbar-wrapper">
        <el-menu
          mode="vertical"
          :default-active="getActiveRoutePath"
          :collapse-transition="false"
          :unique-opened="true"
          :collapse="!sidebar.opened"
        >
          <SidebarItem
            v-for="(route, index) in routes"
            :key="route.path + index"
            :item="route"
            :base-path="route.path"
          />
        </el-menu>
      </el-scrollbar>
    </div>
    <div class="code-info">
      <div v-if="sidebar.opened" class="des">技术支持：cz6</div>
    </div>
  </div>
</template>
<script setup lang="ts" name="Sidebar">
import SidebarItem from "./components/SidebarItem.vue";
import { useLayoutStore } from "@/store/modules/layout";
import { usePermissionStore } from "@/store/modules/permission";

const routes = computed(() => usePermissionStore().routes);
const sidebar = computed(() => useLayoutStore().sidebar);

const router = useRouter();
const getActiveRoutePath = computed((): string => {
  const currentRoute = router.currentRoute.value;
  return (currentRoute.meta.activeMenu as string) ?? currentRoute.path;
});
</script>

<style lang="scss" scoped>
.side-bar {
  height: 100%;

  .logo-container {
    position: relative;
    overflow: hidden;
    height: 50px;

    .logo-link {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      color: #000;

      :deep(.svg-icon) {
        margin: 0 14px;
      }
    }
  }

  .side-menu {
    height: calc(100% - 94px);
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
