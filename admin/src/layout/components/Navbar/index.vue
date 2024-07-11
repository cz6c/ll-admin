<template>
  <div class="navbar">
    <div class="navbar-left">
      <Breadcrumb class="breadcrumb-container" />
    </div>
    <div class="navbar-right">
      <!-- 右侧功能 -->
      <div class="tool navbar-hover">
        <FoldButton />
      </div>
      <!-- 退出登录 -->
      <el-dropdown trigger="click">
        <div class="tool navbar-hover">
          <el-avatar :size="32" fit="cover" :src="useAuthStore().avatar" />
          <p v-if="useAuthStore().username" class="name">{{ useAuthStore().username }}</p>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="logout">
            <el-dropdown-item @click="logout"> 退出系统 </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts" name="Navbar">
import Breadcrumb from "./components/BreadCrumb.vue";
import FoldButton from "./components/FoldButton.vue";
import { useAuthStore } from "@/store/modules/auth";
import { RouterEnum } from "@/router";
import { useRouter } from "vue-router";

const { webLogout } = useAuthStore();
const router = useRouter();

/**
 * @description: 登出
 */
async function logout() {
  await webLogout();
  router.replace({
    path: RouterEnum.BASE_LOGIN_PATH,
    replace: true,
    query: {
      redirect: `${router.currentRoute.value.fullPath}`,
    },
  });
}
</script>

<style scoped lang="scss">
.navbar {
  display: flex;
  justify-content: space-between;
  height: 100%;

  &-left,
  &-right {
    display: flex;
    align-items: center;
    height: 100%;
  }

  &-right {
    .tool {
      > div {
        width: 38px;
        height: 38px;
        text-align: center;
        line-height: 38px;
        box-sizing: border-box;
      }
    }
  }

  &-hover {
    display: flex;
    align-items: center;
    height: 100%;

    &:hover {
      cursor: pointer;
      background-color: #f6f6f6;
    }
  }

  :deep(.el-dropdown) {
    height: 100%;

    .tool {
      padding: 0 8px;

      .name {
        padding-left: 6px;
      }
    }
  }
}
</style>
