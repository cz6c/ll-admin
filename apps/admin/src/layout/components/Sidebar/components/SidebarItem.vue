<script setup lang="ts">
/**
 * 侧栏菜单项（递归）
 * 职责：单可见子路由提升为叶子；多子路由渲染 SubMenu
 * @note 叶子判定用 computed，禁止在模板里副作用改状态（否则会重复渲染闪烁）
 */
import type { AppRouteRecordRaw } from "#/utils";

defineOptions({
  name: "SidebarItem"
});

const props = defineProps<{
  item: AppRouteRecordRaw;
  isNest?: boolean;
}>();

type LeafInfo = {
  route: AppRouteRecordRaw;
  /** true：渲染 Menu.Item；false：渲染 SubMenu */
  isLeaf: boolean;
};

const leafInfo = computed<LeafInfo>(() => {
  const parent = props.item;
  const showing = (parent.children || []).filter(c => !c.hidden);
  if (!parent.children || showing.length === 0) {
    return { route: parent, isLeaf: true };
  }
  if (showing.length === 1) {
    return { route: showing[0], isLeaf: true };
  }
  return { route: parent, isLeaf: false };
});

/** 展开态：仅长标题挂原生 tip，避免短标题重复悬浮 */
function titleTip(title?: string) {
  if (!title || title.length <= 5) return "";
  return title;
}

function menuKey(route: AppRouteRecordRaw) {
  const rawQuery = (route as AppRouteRecordRaw & { query?: string }).query;
  if (rawQuery) {
    try {
      const q = typeof rawQuery === "string" ? JSON.parse(rawQuery) : rawQuery;
      const qs = new URLSearchParams(q as Record<string, string>).toString();
      return qs ? `${route.path}?${qs}` : route.path;
    } catch {
      return route.path;
    }
  }
  return route.path;
}
</script>

<template>
  <template v-if="!item.hidden">
    <!-- title 必须给满：收起时 ant Menu 用它做 hover tooltip；短标题也要能显示「首页」等 -->
    <a-menu-item
      v-if="leafInfo.isLeaf && leafInfo.route.meta"
      :key="menuKey(leafInfo.route)"
      :title="(leafInfo.route.meta.title as string) || undefined"
    >
      <template v-if="leafInfo.route.meta.icon" #icon>
        <IconifyIcon :icon="String(leafInfo.route.meta.icon)" width="1em" height="1em" />
      </template>
      {{ leafInfo.route.meta.title }}
    </a-menu-item>

    <a-sub-menu v-else :key="item.path">
      <template v-if="item.meta?.icon" #icon>
        <IconifyIcon :icon="String(item.meta.icon)" width="1em" height="1em" />
      </template>
      <template v-if="item.meta" #title>
        <span :title="titleTip(item.meta.title as string)">{{ item.meta.title }}</span>
      </template>
      <sidebar-item v-for="child in item.children" :key="child.path" :is-nest="true" :item="child" />
    </a-sub-menu>
  </template>
</template>
