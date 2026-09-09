<!--
  iCloud 同步 — Apple ID 登录面板（抽屉内嵌）
  职责：凭据、区域、2FA、「记住我」；账号前提 tip
  主流程：密码直传 login 换 session；仅勾选记住我且成功后写入钥匙串供下次回填
  @note 面板回填只读 settings/钥匙串，不调 auth_state（探活见 hydrate / 写操作 ensure）
-->
<script setup lang="ts">
import {
  formatIcloudSyncError,
  getIcloudSyncRememberedPassword,
  getIcloudSyncSettings,
  loginIcloudSync,
  saveIcloudSyncRememberedPassword,
  saveIcloudSyncSettings,
  setIcloudSyncCredentials,
  submitIcloudSync2fa,
  type IcloudSyncLoginResult,
  type IcloudSyncSettings
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";
import $feedback from "@/utils/feedback";

defineOptions({ name: "IcloudSyncAuthPanel" });

const props = defineProps<{
  /** 抽屉打开且未登录时为 true，触发拉状态并重置瞬时字段 */
  active: boolean;
}>();

const emit = defineEmits<{
  /** accountChanged：本次登录变更了 Apple ID（旧同步任务不可续传） */
  loggedIn: [payload: { accountChanged: boolean }];
}>();

const loading = ref(false);
const loggingIn = ref(false);
const submitting2fa = ref(false);
const need2fa = ref(false);
const twoFaCode = ref("");
const twoFaDeliveryMethod = ref("");
const twoFaDetail = ref("");

const appleId = ref("");
const password = ref("");
/** 「记住我」：仅勾选时登录成功后写钥匙串，下次打开回填 */
const rememberMe = ref(false);
const initialAppleId = ref("");
const pendingAccountChanged = ref(false);
/** iCloud 根域：中国大陆账号选 cn，海外账号选 com */
const icloudDomain = ref<"com" | "cn">("cn");

const icloudDomainOptions = [
  { value: "cn" as const, label: "中国大陆（icloud.com.cn）" },
  { value: "com" as const, label: "国际（icloud.com）" }
];

const accountSwitchPending = computed(() => {
  const next = appleId.value.trim().toLowerCase();
  const prev = initialAppleId.value.trim().toLowerCase();
  return prev.length > 0 && next.length > 0 && prev !== next;
});

/** 将 sidecar 登录错误转为轻提示 */
function applyAuthFailure(result: IcloudSyncLoginResult) {
  const code = result.errorCode?.trim() || "auth_failed";
  const detail = result.detail?.trim() ?? "";
  $feedback.message.error(formatIcloudSyncError(detail ? `${code}: ${detail}` : code));
}

function applyNeed2faResult(result: IcloudSyncLoginResult) {
  need2fa.value = true;
  twoFaDeliveryMethod.value = result.deliveryMethod?.trim() ?? "";
  // 投递方式推断不可靠（有短信能力仍常标成设备验证），文案用综合引导
  twoFaDetail.value =
    result.detail?.trim() ||
    "请在手机上完成验证（设备弹窗点「允许」，或查收短信），再将 6 位验证码输入下方";
}

const canSubmit2fa = computed(() => need2fa.value && twoFaCode.value.trim().length > 0 && !submitting2fa.value);

const canSubmitLogin = computed(() => appleId.value.trim().length > 0 && password.value.length > 0 && !loggingIn.value && !need2fa.value);

/** 写入区域、appleId、「记住我」开关（不含密码） */
async function persistLoginSettings() {
  const current = await getIcloudSyncSettings();
  const next: IcloudSyncSettings = {
    ...current,
    appleId: appleId.value.trim(),
    icloudDomain: icloudDomain.value,
    rememberPassword: rememberMe.value
  };
  await saveIcloudSyncSettings(next);
}

/**
 * 登录完全成功且勾选「记住我」时写入钥匙串；未勾选不碰钥匙串
 * @note 登录本身不经钥匙串
 */
async function syncKeyringAfterSuccess() {
  if (rememberMe.value) {
    await saveIcloudSyncRememberedPassword(password.value);
  }
  password.value = "";
}

async function loadState() {
  if (!isTauri()) return;
  loading.value = true;
  try {
    // 登录面板只读 settings / 钥匙串回填；不调 auth_state（避免开抽屉重复 probe）
    const settings = await getIcloudSyncSettings();
    appleId.value = settings.appleId || "";
    initialAppleId.value = appleId.value.trim();
    icloudDomain.value = settings.icloudDomain === "com" || settings.icloudDomain === "cn" ? settings.icloudDomain : "cn";
    rememberMe.value = !!settings.rememberPassword;
    if (rememberMe.value) {
      password.value = (await getIcloudSyncRememberedPassword())?.trim() || "";
    } else {
      password.value = "";
    }
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    loading.value = false;
  }
}

function resetTransient() {
  need2fa.value = false;
  twoFaCode.value = "";
  twoFaDeliveryMethod.value = "";
  twoFaDetail.value = "";
}

async function onLogin() {
  if (!canSubmitLogin.value) return;
  loggingIn.value = true;
  need2fa.value = false;
  try {
    // 先落 remember 开关，再换 session；密码只进 login 参数
    await persistLoginSettings();
    const accountChanged = await setIcloudSyncCredentials(appleId.value.trim());
    pendingAccountChanged.value = accountChanged;
    const result = await loginIcloudSync(password.value);
    if (result.status === "error") {
      applyAuthFailure(result);
      return;
    }
    if (result.status === "need_2fa") {
      applyNeed2faResult(result);
      return;
    }
    $feedback.message.success(accountChanged ? "已切换 Apple ID 并登录成功" : "登录成功");
    initialAppleId.value = appleId.value.trim();
    await syncKeyringAfterSuccess();
    emit("loggedIn", { accountChanged });
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    loggingIn.value = false;
  }
}

async function onSubmit2fa() {
  const code = twoFaCode.value.trim();
  if (!code) {
    $feedback.message.warning("请输入 6 位验证码");
    return;
  }
  submitting2fa.value = true;
  try {
    const result = await submitIcloudSync2fa(code);
    if (result.status === "error") {
      applyAuthFailure(result);
      return;
    }
    if (result.status === "need_2fa") {
      applyNeed2faResult(result);
      $feedback.message.warning("仍需完成二次验证，请重试");
      return;
    }
    need2fa.value = false;
    twoFaCode.value = "";
    $feedback.message.success(pendingAccountChanged.value ? "已切换 Apple ID 并验证成功" : "验证成功，已登录");
    initialAppleId.value = appleId.value.trim();
    await syncKeyringAfterSuccess();
    emit("loggedIn", { accountChanged: pendingAccountChanged.value });
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    submitting2fa.value = false;
  }
}

watch(
  () => props.active,
  value => {
    if (value) {
      resetTransient();
      pendingAccountChanged.value = false;
      void loadState();
    }
  },
  { immediate: true }
);
</script>

<template>
  <a-spin :spinning="loading" class="auth-panel-spin">
    <div class="auth-panel">
      <a-alert v-if="accountSwitchPending" type="warning" show-icon class="mb-12px" message="即将切换 Apple ID，旧账号同步任务将无法续传" />

      <a-alert type="info" show-icon class="mb-12px" message="登录前请确认">
        <template #description>
          <ul class="prep-tips">
            <li>1. Apple ID 已开启「网页访问 iCloud 数据」</li>
            <li>2. 已关闭 Advanced Data Protection（高级数据保护）</li>
          </ul>
        </template>
      </a-alert>

      <a-form layout="vertical" class="cred-form">
        <a-form-item label="iCloud 区域" class="form-item-tight">
          <a-select
            v-model:value="icloudDomain"
            :options="icloudDomainOptions"
            :disabled="need2fa || loggingIn || loading"
            placeholder="按 Apple ID 分区选择，选错不会自动切换"
          />
        </a-form-item>
        <a-form-item label="Apple ID" class="form-item-tight">
          <a-input
            v-model:value="appleId"
            type="email"
            placeholder="name@example.com"
            autocomplete="username"
            spellcheck="false"
            :disabled="need2fa || loggingIn || loading"
          />
        </a-form-item>
        <a-form-item label="密码" class="form-item-tight">
          <a-input-password
            v-model:value="password"
            :placeholder="rememberMe ? '已记住时可自动填入' : 'Apple ID 密码'"
            autocomplete="current-password"
            :disabled="need2fa || loggingIn || loading"
          />
        </a-form-item>
        <a-form-item class="form-item-tight remember-item">
          <a-checkbox v-model:checked="rememberMe" :disabled="need2fa || loggingIn || loading">记住我</a-checkbox>
        </a-form-item>

        <template v-if="need2fa">
          <a-form-item label="验证码" class="form-item-tight">
            <a-alert type="info" show-icon class="mb-8px" :message="twoFaDetail" />
            <a-input
              v-model:value="twoFaCode"
              placeholder="短信或设备上的 6 位数字"
              inputmode="numeric"
              :maxlength="6"
              autocomplete="one-time-code"
            />
          </a-form-item>
        </template>
      </a-form>

      <div class="mt-12px">
        <a-button v-if="need2fa" type="primary" class="w-full" :loading="submitting2fa" :disabled="!canSubmit2fa" @click="onSubmit2fa"> 提交验证码 </a-button>
        <a-button v-else type="primary" class="w-full" :loading="loggingIn" :disabled="!canSubmitLogin || loading" @click="onLogin"> 登录 Apple ID </a-button>
      </div>
    </div>
  </a-spin>
</template>

<style scoped lang="scss">
.auth-panel-spin {
  display: block;
  height: 100%;
  overflow: auto;
}

.auth-panel {
  max-width: 400px;
  margin: 0 auto;
}

.prep-tips {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
}

.cred-form {
  margin-bottom: 8px;

  :deep(.form-item-tight.ant-form-item) {
    margin-bottom: 12px;
  }
}

.remember-item {
  :deep(.ant-form-item-control-input-content) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
}
</style>
