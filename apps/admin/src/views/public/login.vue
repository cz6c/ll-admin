<script setup lang="ts">
import { useAuthStore } from "@/store/modules/auth";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import { getCodeImg } from "@/api/public";
import { encrypt, decrypt } from "@/utils/jsencrypt";
import Cookies from "js-cookie";
import { productConfig } from "@/config";
import $feedback from "@/utils/feedback";
import { getPlatFormUUID } from "@/utils/auth";
import LoginSvgCom from "@/assets/svg/login.svg?component";
import { RouterEnum } from "@/router";
import { sanitizePostLoginRedirect } from "@/router/csPublic";
import { usePermissionStore } from "@/store/modules/permission";

defineOptions({
  name: RouterEnum.BASE_LOGIN_NAME
});

const BASE_TITLE = computed(() => {
  return productConfig.title;
});

const formRef = ref<FormInstance>();
const route = useRoute();
const loading = ref(false);
const captchaEnabled = ref(false);
const codeUrl = ref("");
const loginForm = reactive({
  password: "123456",
  userName: "admin",
  rememberMe: false,
  code: "",
  uuid: getPlatFormUUID()
});
const rules: Record<string, Rule[]> = {
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
  userName: [{ required: true, message: "请输入账号", trigger: "blur" }],
  code: [{ required: true, trigger: "change", message: "请输入验证码" }]
};

/**
 * @description: 登录
 */
async function handleLogin() {
  if (!unref(formRef)) return;
  try {
    await unref(formRef).validate();
  } catch {
    return;
  }
  try {
    loading.value = true;
    // 勾选了需要记住密码设置在 cookie 中设置记住用户名和密码
    if (loginForm.rememberMe) {
      Cookies.set("userName", loginForm.userName, { expires: 30 });
      Cookies.set("password", encrypt(loginForm.password), { expires: 30 });
      Cookies.set("rememberMe", loginForm.rememberMe, { expires: 30 });
    } else {
      // 否则移除
      Cookies.remove("userName");
      Cookies.remove("password");
      Cookies.remove("rememberMe");
    }
    await useAuthStore().login(loginForm);
    usePermissionStore()
      .initRouter()
      .then(router => {
        const raw = route.query?.redirect ? decodeURIComponent(route.query.redirect as string) : "/";
        // 登录回跳忽略 CS 本机工具页（免登录，不应抢后台落地页）
        const path = sanitizePostLoginRedirect(raw);
        router.push({ path });
      });
    loading.value = false;
  } catch (error: any) {
    $feedback.message.warning(error.message);
    loading.value = false;
    // 重新获取验证码
    if (captchaEnabled.value) getCode();
  }
}

async function getCode() {
  const { data } = await getCodeImg({ uuid: loginForm.uuid });
  captchaEnabled.value = data.captchaEnabled === undefined ? true : data.captchaEnabled;
  if (captchaEnabled.value) {
    codeUrl.value = data.img;
    loginForm.uuid = data.uuid;
  }
}

function getCookie() {
  const userName = Cookies.get("userName");
  const password = Cookies.get("password");
  const rememberMe = Cookies.get("rememberMe");
  loginForm.userName = userName === undefined ? loginForm.userName : userName;
  loginForm.password = password === undefined ? loginForm.password : (decrypt(password) as string);
  loginForm.rememberMe = rememberMe === undefined ? false : Boolean(rememberMe);
}

getCode();
getCookie();
</script>
<template>
  <div class="login">
    <div class="login-fl">
      <LoginSvgCom style="transform: scale(0.8)" />
    </div>
    <div class="login-fr">
      <div class="login-conten">
        <div class="title-wrapper">
          <h1 class="title">{{ BASE_TITLE }}</h1>
          <p class="description">Welcome back!</p>
        </div>
        <a-form ref="formRef" :rules="rules" :model="loginForm">
          <a-form-item name="userName">
            <a-input v-model:value="loginForm.userName" autocomplete="off" placeholder="请输入账号" size="large">
              <template #prefix>
                <IconifyIcon icon="ant-design:user-outlined" width="16px" height="16px" />
              </template>
            </a-input>
          </a-form-item>
          <a-form-item name="password">
            <a-input-password v-model:value="loginForm.password" autocomplete="off" placeholder="请输入密码" size="large" @pressEnter="handleLogin">
              <template #prefix>
                <IconifyIcon icon="ant-design:lock-outlined" width="16px" height="16px" />
              </template>
            </a-input-password>
          </a-form-item>
          <a-form-item v-if="captchaEnabled" name="code">
            <div class="login-code">
              <a-input v-model:value="loginForm.code" size="large" autocomplete="off" placeholder="验证码" style="width: 60%" @pressEnter="handleLogin()">
                <template #prefix>
                  <IconifyIcon icon="ant-design:safety-certificate-outlined" width="16px" height="16px" />
                </template>
              </a-input>
              <div class="code" @click="getCode" v-html="codeUrl" />
            </div>
          </a-form-item>
          <a-form-item name="rememberMe">
            <a-checkbox v-model:checked="loginForm.rememberMe">记住密码</a-checkbox>
          </a-form-item>
        </a-form>
        <a-button type="primary" class="login-btn" :loading="loading" @click="handleLogin()">
          {{ !loading ? "登 录" : "登 录 中..." }}
        </a-button>
      </div>
      <div class="version-tips">版权信息 | Ccode</div>
    </div>
  </div>
</template>
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
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: rgba(0, 0, 0, 0.88);
        }

        .description {
          margin-top: 8px;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0;
          color: rgba(0, 0, 0, 0.45);
          line-height: 1.5;
        }
      }

      :deep(.ant-form) {
        .ant-form-item {
          position: relative;
          margin-bottom: 24px;
          width: 300px;
        }
        .login-code {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
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
        transition: transform var(--dur-press) var(--ease-out);

        &:active:not(:disabled) {
          transform: scale(0.97);
        }
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
      color: #999999;
      line-height: 26px;
    }
  }
}
</style>
