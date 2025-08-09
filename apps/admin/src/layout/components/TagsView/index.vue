<template>
  <div id="tags-view-container" class="tags-view-container">
    <scroll-pane ref="scrollPaneRef" class="tags-view-wrapper" @scroll="handleScroll">
      <router-link
        v-for="tag in visitedViews"
        :key="tag.path"
        :data-path="tag.path"
        :class="isActive(tag) ? 'active' : ''"
        :to="{ path: tag.path, query: tag.query, fullPath: tag.fullPath }"
        class="tags-view-item"
        @contextmenu.prevent="openMenu(tag, $event)"
      >
        {{ tag.title }}
        <IconifyIcon v-if="!isAffix(tag)" icon="ep:close" class="ml-1" @click.prevent.stop="closeSelectedTag(tag)" />
      </router-link>
    </scroll-pane>
    <ul v-show="visible" :style="{ left: left + 'px', top: top + 'px' }" class="contextmenu">
      <li @click="refreshSelectedTag()"><IconifyIcon icon="ep:refresh-right" /> 刷新页面</li>
      <li v-if="!isAffix(selectedTag)" @click="closeSelectedTag(selectedTag)"><IconifyIcon icon="ep:close" /> 关闭</li>
      <li @click="closeOthersTags"><IconifyIcon icon="ep:circle-close" /> 关闭其他</li>
      <li v-if="!isFirstView()" @click="closeLeftTags"><IconifyIcon icon="ep:back" /> 关闭左侧</li>
      <li v-if="!isLastView()" @click="closeRightTags"><IconifyIcon icon="ep:right" /> 关闭右侧</li>
      <li @click="closeAllTags()"><IconifyIcon icon="ep:circle-close" /> 全部关闭</li>
    </ul>
  </div>
</template>

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

watch(route, () => {
  addTags();
  moveToCurrentTag();
});
watch(visible, value => {
  if (value) {
    document.body.addEventListener("click", closeMenu);
  } else {
    document.body.removeEventListener("click", closeMenu);
  }
});
onMounted(() => {
  initTags();
  addTags();
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
    if (route.meta.link) {
      useTagsViewStore().addIframeView(route);
    }
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
  if (route.meta.link) {
    useTagsViewStore().delIframeView(route);
  }
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

<style lang="scss" scoped>
.tags-view-container {
  height: 34px;
  width: 100%;
  background: #fff;
  border-bottom: 1px solid #d8dce5;
  box-sizing: border-box;
  .tags-view-wrapper {
    .tags-view-item {
      display: inline-flex;
      align-items: center;
      position: relative;
      cursor: pointer;
      height: 26px;
      line-height: 26px;
      border: 1px solid #d8dce5;
      border-bottom: none;
      color: #495060;
      background: #fff;
      padding: 0 8px;
      margin-left: 6px;
      margin-top: 6px;
      border-radius: 6px 6px 0 0;
      &:first-of-type {
        margin-left: 16px;
      }
      &:last-of-type {
        margin-right: 16px;
      }
      &.active {
        background-color: var(--el-color-primary);
        color: #fff;
        border-color: var(--el-color-primary);
        &::before {
          content: "";
          background: #fff;
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          position: relative;
          margin-right: 6px;
        }
      }
    }
  }
  .contextmenu {
    margin: 0;
    background: #fff;
    z-index: 3000;
    position: absolute;
    list-style-type: none;
    padding: 5px 0;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 400;
    color: #333;
    box-shadow: 2px 2px 3px 0 rgba(0, 0, 0, 0.3);
    li {
      margin: 0;
      padding: 7px 16px;
      cursor: pointer;
      &:hover {
        background: #eee;
      }
    }
  }
}
</style>
