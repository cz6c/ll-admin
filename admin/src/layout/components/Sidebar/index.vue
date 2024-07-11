<template>
  <div class="side-bar">
    <div class="logo-container">
      <router-link :key="+new Date()" :title="BASE_TITLE" class="logo-link" to="/">
        <SvgIcon name="logo" size="26" />
        <div v-if="!layoutStore.getIsCollapse" class="logo-title">{{ BASE_TITLE }}</div>
      </router-link>
    </div>
    <div class="side-menu">
      <el-scrollbar wrap-class="scrollbar-wrapper">
        <el-menu
          mode="vertical"
          :default-active="getActiveRoutePath"
          :collapse-transition="false"
          :class="{ on: layoutStore.getIsCollapse }"
          :collapse="layoutStore.getIsCollapse"
        >
          <SubMenu :menu-list="authStore.getDynamicMenu" />
        </el-menu>
      </el-scrollbar>
    </div>
    <div class="code-info">
      <div v-if="!layoutStore.getIsCollapse" class="des">技术支持：cz6</div>
      <div
        class="collapse"
        :class="{ active: layoutStore.getIsCollapse }"
        :title="layoutStore.getIsCollapse ? '点击展开' : '点击折叠'"
        @click="toggleClick"
      >
        <SvgIcon name="collapse" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts" name="Sidebar">
import SubMenu from "./components/SubMenu.vue";
import { useLayoutStore } from "@/store/modules/layout";
import { useAuthStore } from "@/store/modules/auth";

const BASE_TITLE = computed(() => {
  return import.meta.env.VITE_APP_TITLE;
});

const authStore = useAuthStore();

const layoutStore = useLayoutStore();
function toggleClick() {
  layoutStore.setIsCollapse(!layoutStore.getIsCollapse);
}

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

    a {
      text-decoration: none;
    }

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

      .logo-title {
        display: block;
        width: 136px;
        font-size: 20px;
        font-weight: 600;
      }
    }
  }

  .side-menu {
    height: calc(100% - 94px);

    :deep(.scrollbar-wrapper) {
      .el-menu {
        border: none;
      }

      .on {
        .el-sub-menu__title {
          padding-right: 0;
        }
      }
    }
  }

  .code-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 44px;
    font-size: 12px;

    .des {
      padding-left: 12px;
      color: var(--el-color-info);
    }

    .collapse {
      width: 64px;
      text-align: center;
      cursor: pointer;

      &.active {
        transform: rotate(180deg);
      }
    }
  }
}
</style>
