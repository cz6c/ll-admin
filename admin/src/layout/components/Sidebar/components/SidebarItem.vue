<script setup name="SidebarItem">
import { isExternal } from "@/utils/is";
import AppLink from "./Link.vue";
import { getNormalPath } from "@/utils";

const props = defineProps({
  // route object
  item: {
    type: Object,
    required: true,
  },
  isNest: {
    type: Boolean,
    default: false,
  },
  basePath: {
    type: String,
    default: "",
  },
});

const onlyOneChild = ref({});

function hasOneShowingChild(children = [], parent) {
  if (!children) {
    children = [];
  }
  const showingChildren = children.filter(item => {
    if (item.hidden) {
      return false;
    } else {
      // Temp set(will be used if only has one showing child)
      onlyOneChild.value = item;
      return true;
    }
  });

  // When there is only one child router, the child router is displayed by default
  if (showingChildren.length === 1) {
    return true;
  }

  // Show parent if there are no child router to display
  if (showingChildren.length === 0) {
    onlyOneChild.value = { ...parent, path: "", noShowingChildren: true };
    return true;
  }

  return false;
}

function resolvePath(routePath, routeQuery) {
  if (isExternal(routePath)) {
    return routePath;
  }
  if (isExternal(props.basePath)) {
    return props.basePath;
  }
  if (routeQuery) {
    let query = JSON.parse(routeQuery);
    return { path: getNormalPath(props.basePath + "/" + routePath), query: query };
  }
  return getNormalPath(props.basePath + "/" + routePath);
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
  <div>
    <template
      v-if="
        hasOneShowingChild(item.children, item) &&
        (!onlyOneChild.children || onlyOneChild.noShowingChildren) &&
        !item.alwaysShow
      "
    >
      <app-link v-if="onlyOneChild.meta" :to="resolvePath(onlyOneChild.path, onlyOneChild.query)">
        <el-menu-item :index="resolvePath(onlyOneChild.path)" :class="{ 'submenu-title-noDropdown': !isNest }">
          <SvgIcon :name="onlyOneChild.meta.icon || (item.meta && item.meta.icon)" size="18" />
          <template #title
            ><span class="menu-title" :title="hasTitle(onlyOneChild.meta.title)">{{
              onlyOneChild.meta.title
            }}</span></template
          >
        </el-menu-item>
      </app-link>
    </template>

    <el-sub-menu v-else ref="subMenu" :index="resolvePath(item.path)" popper-append-to-body>
      <template v-if="item.meta" #title>
        <SvgIcon :name="item.meta && item.meta.icon" size="18" />
        <span class="sub-menu-text" :title="hasTitle(item.meta.title)">{{ item.meta.title }}</span>
      </template>

      <sidebar-item
        v-for="child in item.children"
        :key="child.path"
        :is-nest="true"
        :item="child"
        :base-path="resolvePath(child.path)"
        class="nest-menu"
      />
    </el-sub-menu>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-menu-item) {
  margin: 0 6px;
  border-radius: 8px;

  &.is-active {
    background: #ededfa;

    &::before {
      position: absolute;
      top: 50%;
      left: 0;
      border-radius: 0 2px 2px 0;
      width: 3px;
      height: 40%;
      transform: translateY(-50%);
      background: var(--el-color-primary);
      content: "";
    }
  }
}

.svg-icon {
  margin-right: 8px;
}
</style>
