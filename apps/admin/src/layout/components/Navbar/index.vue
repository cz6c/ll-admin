<template>
  <div class="navbar">
    <div class="navbar-left">
      <div class="collapse" :class="{ active: !sidebar.opened }" :title="!sidebar.opened ? '点击展开' : '点击折叠'" @click="emits('toggleClick')">
        <IconifyIcon icon="ri:menu-fold-3-line" width="18px" height="18px" />
      </div>
      <Breadcrumb class="breadcrumb-container" />
    </div>
    <!-- 右侧功能 -->
    <div class="navbar-right">
      <div class="tool icon">
        <HeaderSearch />
      </div>
      <div class="tool icon">
        <FoldButton />
      </div>
      <!-- 退出登录 -->
      <el-dropdown trigger="click" @command="handleCommand">
        <div class="tool">
          <div class="img-wrap">
            <BaseImage :src="userStore.avatar" fit="cover" border-radius="50%" />
          </div>
        </div>
        <template #dropdown>
          <router-link to="/user/profile">
            <el-dropdown-item>个人中心</el-dropdown-item>
          </router-link>
          <el-dropdown-menu class="logout">
            <el-dropdown-item command="setLayout">
              <span>布局设置</span>
            </el-dropdown-item>
            <el-dropdown-item divided command="logout"> 退出系统 </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import Breadcrumb from "./components/BreadCrumb.vue";
import FoldButton from "./components/FoldButton.vue";
import HeaderSearch from "@/components/HeaderSearch/index.vue";
import { useAuthStore } from "@/store/modules/auth";
import { useLayoutStore } from "@/store/modules/layout";

defineOptions({
  name: "Navbar"
});

const userStore = useAuthStore();
const layoutStore = useLayoutStore();
const sidebar = computed(() => layoutStore.sidebar);
const emits = defineEmits(["setLayout", "toggleClick"]);
/**
 * @description: 登出
 */
async function logout() {
  ElMessageBox.confirm("确定注销并退出系统吗？", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      userStore.webLogout();
    })
    .catch(() => {});
}

function handleCommand(command: string) {
  switch (command) {
    case "setLayout":
      emits("setLayout");
      break;
    case "logout":
      logout();
      break;
    default:
      break;
  }
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

  &-left {
    .collapse {
      display: flex;
      align-items: center;
      margin-right: 20px;
      cursor: pointer;
      transition: 0.3s all;
      transform-style: preserve-3d;

      &.active {
        transform: scaleX(-1);
        transform-origin: center center;
      }
    }
  }

  &-right {
    .tool {
      display: flex;
      align-items: center;
      height: 100%;
      cursor: pointer;
      padding: 0 12px;

      &.icon {
        &:hover {
          background-color: #f6f6f6;
        }
      }
      .img-wrap {
        width: 28px;
        height: 28px;
        border-radius: 50%;
      }
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
