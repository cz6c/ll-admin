<script setup>
import ScrollPane from "./ScrollPane.vue";
import { useTagsViewStore } from "@/store/modules/tagsView";
import { usePermissionStore } from "@/store/modules/permission";
import { RouterEnum } from "@/router";

const visible = ref(false);
const top = ref(0);
const left = ref(0);
const selectedTag = ref({});
const affixTags = ref([]);
const scrollPaneRef = ref(null);

const { proxy } = getCurrentInstance();
const route = useRoute();
const router = useRouter();

const visitedViews = computed(() => useTagsViewStore().visitedViews);
const routes = computed(() => usePermissionStore().routes);

watch(
  route,
  () => {
    addTags();
    moveToCurrentTag();
  },
  { immediate: true }
);
watch(visible, value => {
  if (value) {
    document.body.addEventListener("click", closeMenu);
  } else {
    document.body.removeEventListener("click", closeMenu);
  }
});
watch(routes, () => {
  initTags();
});

function isActive(r) {
  return r.path === route.path;
}
function isAffix(tag) {
  return tag.meta && tag.meta.affix;
}
function isFirstView() {
  try {
    return selectedTag.value.fullPath === "/index" || selectedTag.value.fullPath === visitedViews.value[1].fullPath;
  } catch (err) {
    return false;
  }
}
function isLastView() {
  try {
    return selectedTag.value.fullPath === visitedViews.value[visitedViews.value.length - 1].fullPath;
  } catch (err) {
    return false;
  }
}
function filterAffixTags(routes) {
  let tags = [];
  routes.forEach(route => {
    if (route.meta && route.meta.affix) {
      const tagPath = route.path;
      tags.push({
        fullPath: tagPath,
        path: tagPath,
        name: route.name,
        meta: { ...route.meta }
      });
    }
    if (route.children) {
      const tempTags = filterAffixTags(route.children);
      if (tempTags.length >= 1) {
        tags = [...tags, ...tempTags];
      }
    }
  });
  return tags;
}
function initTags() {
  const res = filterAffixTags(routes.value);
  affixTags.value = res;
  for (const tag of res) {
    // Must have tag name
    if (tag.name) {
      useTagsViewStore().addVisitedView(tag);
    }
  }
}
function addTags() {
  const { name } = route;
  if (name && name !== RouterEnum.BASE_REDIRECT_NAME) {
    useTagsViewStore().addView(route);
  }
  return false;
}
function moveToCurrentTag() {
  nextTick(() => {
    for (const r of visitedViews.value) {
      if (r.path === route.path) {
        scrollPaneRef.value.moveToTarget(r);
        // when query is different then update
        if (r.fullPath !== route.fullPath) {
          useTagsViewStore().updateVisitedView(route);
        }
      }
    }
  });
}
function refreshSelectedTag() {
  useTagsViewStore().refreshPage(selectedTag.value);
}
function closeSelectedTag(view) {
  useTagsViewStore()
    .closePage(view)
    .then(({ visitedViews }) => {
      if (isActive(view)) {
        toLastView(visitedViews, view);
      }
    });
}
function closeRightTags() {
  useTagsViewStore()
    .delRightViews(selectedTag.value)
    .then(visitedViews => {
      if (!visitedViews.find(i => i.fullPath === route.fullPath)) {
        toLastView(visitedViews);
      }
    });
}
function closeLeftTags() {
  useTagsViewStore()
    .delLeftViews(selectedTag.value)
    .then(visitedViews => {
      if (!visitedViews.find(i => i.fullPath === route.fullPath)) {
        toLastView(visitedViews);
      }
    });
}
function closeOthersTags() {
  router.push(selectedTag.value).catch(() => {});
  useTagsViewStore()
    .delOthersViews(selectedTag.value)
    .then(() => {
      moveToCurrentTag();
    });
}
function closeAllTags() {
  useTagsViewStore()
    .delAllViews()
    .then(({ visitedViews }) => {
      if (affixTags.value.some(tag => tag.path === route.path)) {
        return;
      }
      toLastView(visitedViews, selectedTag.value);
    });
}
function toLastView(visitedViews, view) {
  const latestView = visitedViews.slice(-1)[0];
  if (latestView) {
    router.push(latestView.fullPath);
  } else {
    // now the default is to redirect to the home page if there is no tags-view,
    // you can adjust it according to your needs.
    if (view.name === RouterEnum.BASE_HOME_NAME) {
      // to reload home page
      router.replace({ path: "/redirect" + view.fullPath });
    } else {
      router.push("/");
    }
  }
}
function openMenu(tag, e) {
  const menuMinWidth = 105;
  const offsetLeft = proxy.$el.getBoundingClientRect().left; // container margin left
  const offsetWidth = proxy.$el.offsetWidth; // container width
  const maxLeft = offsetWidth - menuMinWidth; // left boundary
  const l = e.clientX - offsetLeft + 15; // 15: margin right

  if (l > maxLeft) {
    left.value = maxLeft;
  } else {
    left.value = l;
  }

  top.value = e.clientY;
  visible.value = true;
  selectedTag.value = tag;
}
function closeMenu() {
  visible.value = false;
}
function handleScroll() {
  closeMenu();
}
</script>

<template>
  <div id="tags-view-container" class="tags-view-container">
    <scroll-pane ref="scrollPaneRef" class="tags-view-wrapper" @scroll="handleScroll">
      <div class="tags-view-list">
        <router-link
          v-for="(tag, i) in visitedViews"
          :key="tag.path"
          :data-path="tag.path"
          :class="isActive(tag) ? 'active' : ''"
          :to="{ path: tag.path, query: tag.query, fullPath: tag.fullPath }"
          class="tags-view-item select-none"
          @contextmenu.prevent="openMenu(tag, $event)"
        >
          <div class="relative size-full">
            <!-- divider -->
            <div v-if="i !== 0 && !isActive(tag)" class="tags-view-item__divider transition-all" />
            <!-- background -->
            <div class="tags-view-item__background">
              <div class="tags-view-item__background-content" />
              <svg class="tags-view-item__background-before" height="8" width="8">
                <path d="M 0 8 A 8 8 0 0 0 8 0 L 8 8 Z" />
              </svg>
              <svg class="tags-view-item__background-after" height="8" width="8">
                <path d="M 0 0 A 8 8 0 0 0 8 8 L 0 8 Z" />
              </svg>
            </div>
            <!-- tab-item-main -->
            <div class="tags-view-item__main">
              <IconifyIcon v-if="tag.meta.icon" :icon="tag.meta.icon" class="mr-1" />
              <span class="flex-1 overflow-hidden whitespace-nowrap">
                {{ tag.title }}
              </span>
              <IconifyIcon v-if="!isAffix(tag)" icon="ep:close" class="close ml-1" @click.prevent.stop="closeSelectedTag(tag)" />
            </div>
          </div>
        </router-link>
      </div>
    </scroll-pane>
    <ul v-show="visible" :style="{ left: left + 'px', top: top + 'px' }" class="contextmenu">
      <li @click="refreshSelectedTag()"><IconifyIcon icon="ep:refresh-right" /> <span>刷新页面</span></li>
      <li v-if="!isAffix(selectedTag)" @click="closeSelectedTag(selectedTag)"><IconifyIcon icon="ep:close" /> <span>关闭当前标签页</span></li>
      <li @click="closeOthersTags"><IconifyIcon icon="ep:circle-close" /> <span>关闭其他标签页</span></li>
      <li v-if="!isFirstView()" @click="closeLeftTags"><IconifyIcon icon="ep:back" /> <span>关闭左侧标签页</span></li>
      <li v-if="!isLastView()" @click="closeRightTags"><IconifyIcon icon="ep:right" /> <span>关闭右侧标签页</span></li>
      <li @click="closeAllTags()"><IconifyIcon icon="ep:circle-close" /> <span>全部关闭标签页</span></li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.tags-view-container {
  height: 38px;
  width: 100%;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  box-sizing: border-box;
  .tags-view-list {
    padding-top: 4px;
    display: flex;
    align-items: center;
    .tags-view-item {
      display: inline-flex;
      cursor: pointer;
      height: 34px;
      margin-left: -12px;
      &:first-of-type {
        margin-left: 0;
      }
      &__divider {
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        height: 16px;
        width: 1px;
        background-color: var(--border-color);
      }
      &__background {
        position: absolute;
        width: 100%;
        height: 100%;
        padding: 0 8px;
        &-content {
          height: 100%;
        }
        &-before,
        &-after {
          position: absolute;
          bottom: 0;
          fill: transparent;
        }
        &-before {
          left: 0px;
        }
        &-after {
          right: 0px;
        }
      }
      &__main {
        position: relative;
        display: flex;
        align-items: center;
        height: 100%;
        overflow: hidden;
        padding: 0 16px;
        .close {
          &:hover {
            background-color: var(--bg-color);
            border-radius: 50%;
          }
        }
      }
      &.active {
        & + .tags-view-item {
          .tags-view-item__divider {
            opacity: 0 !important;
          }
        }
        .tags-view-item__background {
          &-content {
            background-color: var(--color-primary-bg) !important;
            border-radius: 6px 6px 0 0 !important;
          }
          &-before {
            fill: var(--color-primary-bg);
          }
          &-after {
            fill: var(--color-primary-bg);
          }
        }
        .tags-view-item__main {
          color: var(--color-primary);
        }
      }
      &:hover:not(.active) {
        & + .tags-view-item {
          .tags-view-item__divider {
            opacity: 0;
          }
        }
        .tags-view-item__divider {
          opacity: 0;
        }
        .tags-view-item__background {
          &-content {
            background-color: var(--fill-color);
            border-radius: 6px;
          }
        }
      }
    }
  }
  .contextmenu {
    margin: 0;
    background: var(--bg-color);
    z-index: 3000;
    position: absolute;
    list-style-type: none;
    padding: 2px;
    border-radius: 6px;
    box-shadow: 2px 2px 3px 0 rgba(0, 0, 0, 0.3);
    li {
      margin: 0;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 6px;
      display: flex;
      align-items: center;
      span {
        margin-left: 4px;
      }
      &:hover {
        background: var(--fill-color);
      }
    }
  }
}
</style>
