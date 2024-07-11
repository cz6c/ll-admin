<template>
  <template v-for="item in menuList" :key="item.path">
    <template v-if="isSubmenu(item)">
      <el-sub-menu :index="item.path">
        <template #title>
          <SvgIcon v-if="item.meta?.icon" :name="item.meta?.icon" size="18" />
          <span class="sub-menu-text">{{ item.meta?.title }}</span>
        </template>
        <SubMenu v-if="item.children?.length" :menu-list="item.children" />
      </el-sub-menu>
    </template>
    <template v-else>
      <el-menu-item :index="item.path" @click="handleClickMenu(item)">
        <SvgIcon v-if="item.meta?.icon" :name="item.meta?.icon" size="18" />
        <span class="menu-text">{{ item.meta?.title }}</span>
      </el-menu-item>
    </template>
  </template>
</template>

<script setup lang="ts" name="SubMenu">
import { useRouter } from "vue-router";
import type { AppRouteRecordRaw } from "@/router/type";
import { openWindow } from "@/utils";
import { isUrl } from "@/utils/is";

defineProps<{ menuList: AppRouteRecordRaw[] }>();

const router = useRouter();

/**
 * @description: 判断路由是否有可显示的子集菜单
 * @param {AppRouteRecordRaw} item 路由
 * @return {boolean} boolean
 */
function isSubmenu(item: AppRouteRecordRaw): boolean {
  const childItem = item.children || [];
  const showItemList = childItem.filter(({ meta }) => !meta?.hidden);
  return showItemList.length > 0;
}
/**
 * @description: 点击菜单栏
 * @param {AppRouteRecordRaw} item 当前路由
 */
const handleClickMenu = (item: AppRouteRecordRaw) => {
  if (isUrl(item.path)) {
    openWindow(item.path);
    return;
  }
  router.push(item.path);
};
</script>

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
