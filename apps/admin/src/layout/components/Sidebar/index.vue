<template>
  <div class="side-bar">
    <div class="logo-container">
      <div class="logo-link">
        <Transition name="el-zoom-in-center" mode="out-in">
          <LogoSvgCom v-if="sidebar.opened" width="26px" height="26px" />
          <LogoSvgCom v-else width="26px" height="26px" />
        </Transition>
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
import LogoSvgCom from "@/assets/svg/logo.svg?component";

defineOptions({
  name: "Sidebar"
});

const routes = computed(() => usePermissionStore().routes);
const sidebar = computed(() => useLayoutStore().sidebar);

const router = useRouter();
const getActiveRoutePath = computed((): string => {
  const currentRoute = router.currentRoute.value;
  return (currentRoute.meta.activeMenu as string) || currentRoute.path;
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
