<script setup lang="ts">
import AppLink from "./Link.vue";
import type { AppRouteRecordRaw } from "#/utils";

defineOptions({
  name: "SidebarItem"
});

// route object
const { item, isNest = false } = defineProps({
  item: {
    type: Object
  },
  isNest: {
    type: Boolean
  }
});

const onlyOneChild = ref(
  {} as AppRouteRecordRaw & {
    hasOneShowingChild: boolean;
    query: Record<string, any>;
  }
);

function hasOneShowingChild(children, parent) {
  // 当没有子路由器时，显示父路由
  if (!children) {
    return (onlyOneChild.value = { ...parent, hasOneShowingChild: true });
  }
  const showingChildren = children.filter(item => !item.hidden);
  if (showingChildren.length === 1) {
    // 当一个子路由器时，显示子路由器
    return (onlyOneChild.value = {
      ...showingChildren[0],
      hasOneShowingChild: true
    });
  } else {
    // 当多个子路由器时，显示el-sub-menu
    return (onlyOneChild.value = { ...parent, hasOneShowingChild: false });
  }
}

function resolvePath(routePath, routeQuery) {
  if (routeQuery) {
    let query = JSON.parse(routeQuery);
    return {
      path: routePath,
      query: query
    };
  } else {
    return routePath;
  }
}

function hasTitle(title) {
  if (title.length > 5) {
    return title;
  } else {
    return "";
  }
}
</script>

<template>
  <div v-if="!item.hidden">
    <template v-if="hasOneShowingChild(item.children, item) && onlyOneChild.hasOneShowingChild">
      <app-link v-if="onlyOneChild.meta" :to="resolvePath(onlyOneChild.path, onlyOneChild.query)">
        <el-menu-item :index="onlyOneChild.path" :class="{ 'sub-menu-title-noDropdown': !isNest }">
          <IconifyIcon v-if="onlyOneChild.meta.icon" :icon="onlyOneChild.meta.icon" width="18px" height="18px" class="svg-icon" />
          <template #title>
            <span class="menu-title" :title="hasTitle(onlyOneChild.meta.title)">{{ onlyOneChild.meta.title }}</span>
          </template>
        </el-menu-item>
      </app-link>
    </template>

    <el-sub-menu v-else :index="item.path" popper-append-to-body>
      <template v-if="item.meta" #title>
        <IconifyIcon v-if="item.meta.icon" :icon="item.meta.icon" width="18px" height="18px" class="svg-icon" />
        <span class="menu-title" :title="hasTitle(item.meta.title)">{{ item.meta.title }}</span>
      </template>
      <sidebar-item v-for="child in item.children" :key="child.path" :is-nest="true" :item="child" class="nest-menu" />
    </el-sub-menu>
  </div>
</template>
