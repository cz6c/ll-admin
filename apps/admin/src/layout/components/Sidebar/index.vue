<template>
  <div class="side-bar">
    <div v-if="sidebarLogo" class="logo-container">
      <div class="logo-link">
        <img class="sidebar-logo" :src="logo" width="26" height="26" alt="Ccode" />
        <span v-if="!collapsed" class="sidebar-title">{{ productConfig.title }}</span>
      </div>
    </div>
    <div class="side-menu">
      <div class="scrollbar-wrapper">
        <a-menu v-model:open-keys="openKeys" mode="inline" :selected-keys="selectedKeys" :inline-collapsed="collapsed" @click="onMenuClick">
          <SidebarItem v-for="route in menuRoutes" :key="route.path" :item="route" />
        </a-menu>
      </div>
    </div>
    <div class="code-info">
      <div v-if="!collapsed" class="des">技术支持：Ccode</div>
    </div>
  </div>
</template>
<script setup lang="ts">
/**
 * 侧栏导航
 * 职责：权限路由树、展开态、选中与路由同步（允许多 SubMenu 同时展开，非手风琴）
 */
import type { MenuProps } from "ant-design-vue";
import SidebarItem from "./components/SidebarItem.vue";
import { useLayoutStore } from "@/store/modules/layout";
import { usePermissionStore } from "@/store/modules/permission";
import { useSettingsStore } from "@/store/modules/settings";
import { productConfig } from "@/config";
import type { AppRouteRecordRaw } from "#/utils";
import logo from "@/assets/images/logo.png";

defineOptions({
  name: "Sidebar"
});

const permissionStore = usePermissionStore();
const layoutStore = useLayoutStore();
const settingsStore = useSettingsStore();

const menuRoutes = computed(() => permissionStore.routes as AppRouteRecordRaw[]);
const collapsed = computed(() => !layoutStore.sidebar.opened);
const sidebarLogo = computed(() => settingsStore.sidebarLogo);

const router = useRouter();
const activePath = computed((): string => {
  const currentRoute = router.currentRoute.value;
  return (currentRoute.meta.activeMenu as string) || currentRoute.path;
});
const selectedKeys = computed(() => [activePath.value]);

const openKeys = ref<string[]>([]);

/**
 * 当前激活路由对应的应展开 SubMenu keys
 * @note 与 SidebarItem「单可见子节点提升为叶子」一致
 */
function collectOpenKeys(list: AppRouteRecordRaw[], path: string, parents: string[] = []): string[] {
  for (const route of list) {
    if (route.hidden) continue;
    const showing = (route.children || []).filter(c => !c.hidden);
    if (showing.length > 1) {
      for (const child of showing) {
        if (child.path === path || path.startsWith(`${child.path}/`)) {
          return [...parents, route.path];
        }
        const nested = collectOpenKeys([child], path, [...parents, route.path]);
        if (nested.length) return nested;
      }
      const deeper = collectOpenKeys(showing, path, [...parents, route.path]);
      if (deeper.length) return deeper;
    } else if (showing.length === 1) {
      const only = showing[0];
      if (only.path === path || path.startsWith(`${only.path}/`)) return parents;
      const nested = collectOpenKeys(showing, path, parents);
      if (nested.length) return nested;
    } else if (route.path === path || path.startsWith(`${route.path}/`)) {
      return parents;
    }
  }
  return [];
}

function sameKeys(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

/** 路由变化时补齐父级展开，不关掉用户已展开的其它项 */
function syncOpenKeysByRoute() {
  if (collapsed.value) {
    if (openKeys.value.length) openKeys.value = [];
    return;
  }
  const required = collectOpenKeys(menuRoutes.value, activePath.value);
  const merged = Array.from(new Set([...openKeys.value, ...required]));
  if (!sameKeys(openKeys.value, merged)) openKeys.value = merged;
}

const onMenuClick: MenuProps["onClick"] = info => {
  const key = String(info.key || "");
  if (!key) return;
  if (key.startsWith("http://") || key.startsWith("https://")) {
    window.open(key, "_blank", "noopener");
    return;
  }
  const qIndex = key.indexOf("?");
  if (qIndex > -1) {
    const path = key.slice(0, qIndex);
    const search = key.slice(qIndex + 1);
    const query = Object.fromEntries(new URLSearchParams(search).entries());
    if (path === activePath.value) return;
    router.push({ path, query });
    return;
  }
  if (key === activePath.value) return;
  router.push(key);
};

watch(activePath, syncOpenKeysByRoute, { immediate: true });
watch(collapsed, syncOpenKeysByRoute);
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
      color: var(--color-text);
    }

    .sidebar-logo {
      display: block;
      flex-shrink: 0;
      border-radius: 50%;
    }

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
    color: var(--color-text-tertiary);
  }
}
</style>
