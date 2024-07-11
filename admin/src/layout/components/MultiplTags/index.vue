<template>
  <div class="tags-view">
    <el-scrollbar>
      <div class="tags">
        <div class="tag" v-for="(tag, index) in multiTagsStore.getMultiTags" :key="index">
          <el-tag
            :closable="!tag.meta?.affix"
            size="large"
            :effect="isActive(tag) ? 'dark' : 'light'"
            round
            @contextmenu.prevent="openMenu(tag, $event)"
            @close="handleClose(1, tag)"
            @click="$router.push(tag.fullPath || tag.path)"
          >
            {{ tag.meta.title }}
          </el-tag>
        </div>
      </div>
    </el-scrollbar>
    <!-- 右键菜单 -->
    <RightDropdown
      ref="rightDropdownRef"
      :visible="visible"
      :menuTop="menuTop"
      :menuLeft="menuLeft"
      :selectedTag="selectedTag!"
    />
  </div>
</template>
<script setup lang="ts" name="MultiplTags">
import { ref, watch, unref } from "vue";
import { useMultiTagsStore, MultiTagsItem } from "@/store/modules/multiTags";
import { useRoute } from "vue-router";
import { useEventListener } from "@vueuse/core";
import { RouterEnum } from "@/router";
import { initAffixTags, useTagsDrag } from "./useMultipleTags";
import RightDropdown from "./components/RightDropdown.vue";

const route = useRoute();
const affixTextList = initAffixTags();
useTagsDrag(affixTextList);
const multiTagsStore = useMultiTagsStore();

const selectedTag = ref<MultiTagsItem>();
const rightDropdownRef = ref();
const visible = ref<boolean>(false);
const menuTop = ref<number>(0);
const menuLeft = ref<number>(0);

function isActive(tag: MultiTagsItem) {
  return unref(route.fullPath) === tag.fullPath;
}

watch(
  () => route,
  value => {
    const { name } = unref(value);
    // 不需要新增的到标签页的情况在这里处理
    if (name === RouterEnum.REDIRECT_NAME || !value) {
      return;
    }
    const { path, fullPath, meta = {} } = value;
    // const { activeMenu, hideTag } = meta;
    // const isHide = !hideTag ? null : activeMenu;
    // if (isHide) {
    //   const findParentRoute = router.getRoutes().find(item => item.path === activeMenu);
    //   findParentRoute &&
    //     multiTagsStore.addTag({
    //       name: findParentRoute.name as string,
    //       path: findParentRoute.path,
    //       meta: findParentRoute.meta,
    //     });
    // } else {
    multiTagsStore.addTag({ name: name as string, path, meta, fullPath });
    // }
  },
  { immediate: true, deep: true },
);

/**
 * @description: 关闭标签页
 * @param {*} index
 * @param {*} tag
 */
function handleClose(index: number, tag: MultiTagsItem) {
  unref(rightDropdownRef).handleClickDrop(index, tag);
}

/**
 * @description: 打开右键菜单
 * @param {*} tag
 * @param {*} e
 */
function openMenu(tag: MultiTagsItem, e: MouseEvent) {
  // console.log(tag, e);
  menuLeft.value = e.clientX;
  menuTop.value = e.clientY;
  selectedTag.value = tag;
  visible.value = true;
}

/**
 * @description: 关闭右键菜单
 */
function closeMenu() {
  visible.value = false;
}

watch(
  () => visible.value,
  () => {
    useEventListener(document, "click", closeMenu);
  },
);
</script>
<style lang="scss" scoped>
.tags-view {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  :deep(.el-scrollbar) {
    flex: 1;

    .tags {
      display: flex;
      align-items: center;

      .tag {
        cursor: pointer;
      }

      .tag + .tag {
        margin-left: 8px;
      }
    }
  }
}
</style>
