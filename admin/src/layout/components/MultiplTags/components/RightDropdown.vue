<template>
  <transition name="el-zoom-in-top">
    <ul v-show="visible" :key="Math.random()" :style="getContextMenuStyle" class="contextmenu">
      <li
        v-for="(item, index) in tagMenu"
        :key="index"
        :class="`${props.selectedTag && isDisabled(index) ? 'disabled' : ''}`"
        @click="props.selectedTag && !isDisabled(index) && handleClickDrop(index, props.selectedTag)"
      >
        <SvgIcon :name="item.icon" />
        <span> {{ item.text }}</span>
      </li>
    </ul>
  </transition>
</template>

<script setup lang="ts" name="RightDropdown">
import { unref, computed, CSSProperties } from "vue";
import { useMultiTagsStore, MultiTagsItem } from "@/store/modules/multiTags";
import { useRouter } from "vue-router";

const props = defineProps<{
  visible: boolean;
  menuTop: number;
  menuLeft: number;
  selectedTag: MultiTagsItem;
}>();

const multiTagsStore = useMultiTagsStore();
const router = useRouter();

const tagMenu = [
  {
    icon: "back_top",
    text: "重新加载",
  },
  {
    icon: "back_top",
    text: "关闭标签页",
  },
  {
    icon: "back_top",
    text: "关闭其他标签页",
  },
  {
    icon: "back_top",
    text: "关闭全部标签页",
  },
];

const getContextMenuStyle = computed((): CSSProperties => {
  return { left: props.menuLeft + "px", top: props.menuTop + "px" };
});

/**
 * @description: 计算各菜单的禁用情况
 * @param {*} index
 * @return {*}
 */
function isDisabled(index: number): boolean {
  let disabled = false;
  const filterTags = multiTagsStore.getMultiTags.filter(x => !x.meta?.affix);
  const route = unref(router.currentRoute);
  const tag = unref(props.selectedTag)!;
  switch (index) {
    case 0:
      disabled = route.path !== tag.path && route.name !== tag.name;
      break;
    case 1:
      disabled = !!tag.meta?.affix;
      break;
    case 2:
      disabled = tag.meta?.affix ? filterTags.length < 1 : filterTags.length < 2;
      break;
    case 3:
      disabled = filterTags.length < 1;
      break;
  }
  return disabled;
}

/**
 * @description: 右键菜单点击
 * @param {*} index
 * @param {*} tag
 */
async function handleClickDrop(index: number, tag: MultiTagsItem) {
  switch (index) {
    case 0:
      await multiTagsStore.refreshPage(router);
      break;

    case 1:
      await multiTagsStore.closeTag(tag, router);
      break;

    case 2:
      await multiTagsStore.closeOtherTags(tag);
      break;

    case 3:
      await multiTagsStore.closeAllTags(router);
      break;
  }
}

defineExpose({
  handleClickDrop,
});
</script>

<style scoped lang="scss">
.contextmenu {
  position: fixed;
  z-index: 6666;
  margin: 0;
  border-radius: 2px;
  padding: 5px 0;
  font-size: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  list-style-type: none;

  li {
    display: flex;
    align-items: center;
    margin: 0;
    padding: 6px 12px;
    cursor: pointer;

    &:hover {
      background: #eee;
    }

    &.disabled {
      cursor: no-drop;
      opacity: 0.6;

      &:hover {
        background: none;
      }
    }

    span {
      padding-left: 4px;
    }
  }
}
</style>
