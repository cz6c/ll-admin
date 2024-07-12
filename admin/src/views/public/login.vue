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
            <el-input v-model="loginForm.username" auto-complete="off" placeholder="请输入账号">
              <template #prefix><SvgIcon name="user" size="20" /></template>
            </el-input>
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              show-password
              auto-complete="off"
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
            >
              <template #prefix><SvgIcon name="password" size="20" /></template>
            </el-input>
          </el-form-item>
          <el-form-item prop="code" v-if="captchaEnabled">
            <div class="login-code">
              <el-input
                v-model="loginForm.code"
                size="large"
                auto-complete="off"
                placeholder="验证码"
                style="width: 60%"
                @keyup.enter="handleLogin()"
              >
                <template #prefix><SvgIcon name="validCode" size="20" /></template>
              </el-input>
              <div class="code" v-html="codeUrl" @click="getCode"></div>
            </div>
          </el-form-item>
          <el-form-item prop="rememberMe">
            <el-checkbox v-model="loginForm.rememberMe">记住密码</el-checkbox>
          </el-form-item>
        </el-form>
        <el-button type="primary" class="login-btn" :loading="loading" @click="handleLogin()">{{
          !loading ? "登 录" : "登 录 中..."
        }}</el-button>
      </div>
      <div class="version-tips">版权信息 | cz6</div>
    </div>
  </div>
</template>

<script setup lang="ts" name="Login">
import { useAuthStore } from "@/store/modules/auth";
import type { FormInstance, FormRules } from "element-plus";
import { $message } from "@/utils/message";
import { getCodeImg } from "@/api/public";
import { encrypt, decrypt } from "@/utils/jsencrypt";
import Cookies from "js-cookie";

const BASE_TITLE = computed(() => {
  return import.meta.env.VITE_APP_TITLE;
});

const formRef = ref<FormInstance>();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const captchaEnabled = ref(true);
const codeUrl = ref("");
let redirect = ref("");
const loginForm = reactive({
  password: "123456",
  username: "admin",
  rememberMe: false,
  code: "",
  uuid: "",
});
const rules: FormRules = {
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
  username: [{ required: true, message: "请输入账号", trigger: "blur" }],
  code: [{ required: true, trigger: "change", message: "请输入验证码" }],
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
function handleLogin() {
  if (!unref(formRef)) return;
  unref(formRef).validate(async valid => {
    if (valid) {
      try {
        loading.value = true;
        // 勾选了需要记住密码设置在 cookie 中设置记住用户名和密码
        if (loginForm.rememberMe) {
          Cookies.set("username", loginForm.username, { expires: 30 });
          Cookies.set("password", encrypt(loginForm.password), { expires: 30 });
          Cookies.set("rememberMe", loginForm.rememberMe, { expires: 30 });
        } else {
          // 否则移除
          Cookies.remove("username");
          Cookies.remove("password");
          Cookies.remove("rememberMe");
        }
        await useAuthStore().login(loginForm);
        router.push({
          path: redirect.value || "/",
        });
        loading.value = false;
      } catch (error: any) {
        $message.warning(error.message);
        loading.value = false;
        // 重新获取验证码
        if (captchaEnabled.value) getCode();
      }
    }
  });
}

async function getCode() {
  const { data } = await getCodeImg();
  captchaEnabled.value = data.captchaEnabled === undefined ? true : data.captchaEnabled;
  if (captchaEnabled.value) {
    codeUrl.value = data.img;
    loginForm.uuid = data.uuid;
  }
}

function getCookie() {
  const username = Cookies.get("username");
  const password = Cookies.get("password");
  const rememberMe = Cookies.get("rememberMe");
  loginForm.username = username === undefined ? loginForm.username : username;
  loginForm.password = password === undefined ? loginForm.password : decrypt(password);
  loginForm.rememberMe = rememberMe === undefined ? false : Boolean(rememberMe);
}

getCode();
getCookie();
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
        .login-code {
          display: flex;
          align-items: center;
          justify-content: space-between;
          .code {
            width: 36%;
            height: 40px;
            img {
              cursor: pointer;
              vertical-align: middle;
            }
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
