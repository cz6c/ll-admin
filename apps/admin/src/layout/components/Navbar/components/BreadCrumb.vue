<script setup lang="ts">
import { RouterEnum } from "@/router";

defineOptions({
  name: "BreadCrumb"
});

const route = useRoute();
const router = useRouter();
const levelList = ref([]);

function getBreadcrumb() {
  // 仅显示带有标题的路由
  levelList.value = route.matched.filter(item => item.meta && item.meta.title && item.meta.breadcrumb !== false);
}

function handleLink(item) {
  const { redirect, path } = item;
  if (redirect) {
    router.push(redirect as string);
    return;
  }
  router.push(path);
}

watchEffect(() => {
  // 如果转到重定向页面，不进行更新
  if (route.name === RouterEnum.BASE_REDIRECT_NAME) return;
  getBreadcrumb();
});
getBreadcrumb();
</script>

<template>
  <el-breadcrumb class="app-breadcrumb" separator="/">
    <transition-group name="breadcrumb">
      <el-breadcrumb-item v-for="(item, index) in levelList" :key="item.path">
        <span v-if="item.redirect === 'noRedirect' || index == levelList.length - 1" class="no-redirect">{{ item.meta.title }}</span>
        <a v-else @click.prevent="handleLink(item)">{{ item.meta.title }}</a>
      </el-breadcrumb-item>
    </transition-group>
  </el-breadcrumb>
</template>

<style lang="scss" scoped>
.app-breadcrumb.el-breadcrumb {
  display: inline-block;
  font-size: 14px;
  line-height: 50px;
  margin-left: 8px;

  .no-redirect {
    color: #97a8be;
    cursor: text;
  }
}
</style>
