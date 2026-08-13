<template>
  <div class="navbar">
    <div class="navbar-left">
      <div class="collapse" :class="{ active: !sidebar.opened }" :title="!sidebar.opened ? '点击展开' : '点击折叠'" @click="emits('toggleClick')">
        <IconifyIcon icon="ant-design:menu-fold-outlined" width="18px" height="18px" />
      </div>
      <!-- <Breadcrumb /> -->
      <HeaderSearch />
    </div>
    <!-- 右侧功能 -->
    <div class="navbar-right">
      <!-- 退出登录 -->
      <a-dropdown>
        <div class="tool">
          <div class="flex-center gap-2">
            <div class="img-wrap">
              <BaseImage :src="userStore.avatar" fit="cover" border-radius="50%" />
            </div>
            <span class="name">{{ userStore.userName }}</span>
          </div>
        </div>
        <template #overlay>
          <a-menu>
            <a-menu-item @click="handleProfile">
              <div class="flex-center gap-2">
                <IconifyIcon icon="ant-design:user-outlined" width="16px" height="16px" />
                <span>个人中心</span>
              </div>
            </a-menu-item>
            <a-menu-item @click="emits('setLayout')">
              <div class="flex-center gap-2">
                <IconifyIcon icon="ant-design:setting-outlined" width="16px" height="16px" />
                <span>布局设置</span>
              </div>
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item @click="logout">
              <div class="flex-center gap-2">
                <IconifyIcon icon="ant-design:logout-outlined" width="16px" height="16px" />
                <span>退出系统</span>
              </div>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
// import Breadcrumb from "./components/BreadCrumb.vue";
import HeaderSearch from "./components/HeaderSearch.vue";
import { useAuthStore } from "@/store/modules/auth";
import { useLayoutStore } from "@/store/modules/layout";
import $feedback from "@/utils/feedback";
import { useRouter } from "vue-router";

defineOptions({
  name: "Navbar"
});

const router = useRouter();
const userStore = useAuthStore();
const layoutStore = useLayoutStore();
const sidebar = computed(() => layoutStore.sidebar);
const emits = defineEmits(["setLayout", "toggleClick"]);
/**
 * @description: 登出
 */
async function logout() {
  try {
    await $feedback.confirm("确定注销并退出系统吗？");
    userStore.webLogout();
  } catch {
    /* 用户取消 */
  }
}

function handleProfile() {
  router.push("/user/profile");
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
      margin-right: 16px;
      cursor: pointer;
      transition: transform var(--dur-panel) var(--ease-out);
      transform-style: preserve-3d;

      &.active {
        transform: scaleX(-1);
        transform-origin: center center;
      }

      &:hover {
        color: var(--color-primary);
      }
    }
  }

  &-right {
    .tool {
      display: flex;
      align-items: center;
      height: 100%;
      cursor: pointer;
      padding: 0 8px;

      &:hover {
        background-color: var(--fill-color);
      }

      &.icon {
        transition:
          background-color var(--dur-press) var(--ease-out),
          transform var(--dur-press) var(--ease-out);
      }

      .img-wrap {
        width: 28px;
        height: 28px;
        border-radius: 50%;
      }
    }
  }
}
</style>
