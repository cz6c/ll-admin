<template>
  <div class="login">
    <div class="login-fl">
      <SvgIcon name="login" size="368" />
    </div>
    <div class="login-fr">
      <div class="login-conten">
        <div class="title-wrapper">
          <h1 class="title">Welcome back!</h1>
          <p class="description">{{ BASE_TITLE }}</p>
        </div>
        <el-form ref="formRef" :rules="rules" :model="loginForm">
          <el-form-item prop="username">
            <el-input v-model="loginForm.username" placeholder="请输入账号" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input v-model="loginForm.password" type="password" show-password placeholder="请输入密码" />
          </el-form-item>
        </el-form>
        <el-button type="primary" class="login-btn" :loading="loading" @click="handleLogin(formRef)">登 录</el-button>
      </div>
      <div class="version-tips">版权信息 | cz6</div>
    </div>
  </div>
</template>

<script setup lang="ts" name="Login">
import { useAuthStore } from "@/store/modules/auth";
import type { FormInstance, FormRules } from "element-plus";
import { $message } from "@/utils/message";

const BASE_TITLE = computed(() => {
  return import.meta.env.VITE_APP_TITLE;
});

const formRef = ref<FormInstance>();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
let redirect = ref("");
const loginForm = reactive({
  password: "123456",
  username: "admin",
});
const rules: FormRules = {
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
  username: [{ required: true, message: "请输入账号", trigger: "blur" }],
};

watch(
  () => route,
  newValue => {
    const query = newValue.query;
    if (query.redirect) {
      redirect.value = String(query.redirect);
    }
  },
  { immediate: true },
);
/**
 * @description: 登录
 */
function handleLogin(formEl: FormInstance | undefined) {
  if (!formEl) return;
  formEl.validate(async valid => {
    if (valid) {
      try {
        loading.value = true;
        await useAuthStore().login(loginForm);
        router.push({
          path: redirect.value || "/",
        });
        loading.value = false;
      } catch (error: any) {
        $message.warning(error.message);
        loading.value = false;
      }
    }
  });
}
</script>

<style scoped lang="scss">
.login {
  display: flex;
  height: 100%;

  > div {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 50%;
    height: 100%;
  }

  .login-fl {
    background-color: #f6f7f9;
  }

  .login-fr {
    position: relative;

    .login-conten {
      .title-wrapper {
        margin-bottom: 12px;

        .title {
          font-size: 32px;
          font-weight: 600;
        }

        .description {
          font-size: 16px;
          font-weight: 400;
          color: #999;
          line-height: 36px;
        }
      }

      :deep(.el-form) {
        .el-form-item {
          position: relative;
          margin-bottom: 24px;
          width: 300px;

          .el-input__inner {
            border-radius: 8px;
            height: 40px;
            line-height: 40px;
          }
        }
      }

      :deep(.login-btn) {
        border-radius: 8px;
        width: 300px;
        height: 40px;
        line-height: 40px;
      }

      .login-timeout {
        margin-top: 20px;
      }
    }

    .version-tips {
      position: absolute;
      bottom: 8px;
      font-size: 12px;
      font-weight: 400;
      color: #999;
      line-height: 26px;
    }
  }
}
</style>
