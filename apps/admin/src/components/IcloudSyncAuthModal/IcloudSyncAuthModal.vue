<!--
  iCloud 同步 — Apple ID 登录弹窗
  职责：ToS + 账号清单、凭据、2FA；供相册内同步页在登录失效或主动登录时唤起
  主流程：打开时拉 auth 状态 → consent → 保存凭据 → login → need_2fa 则验证码
-->
<script setup lang="ts">
import {
  formatIcloudSyncError,
  getIcloudSyncAuthState,
  getIcloudSyncSettings,
  loginIcloudSync,
  saveIcloudSyncSettings,
  setIcloudSyncCredentials,
  submitIcloudSync2fa,
  type IcloudSyncSettings
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "IcloudSyncAuthModal" });

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  loggedIn: [];
}>();

const loading = ref(false);
const loggingIn = ref(false);
const submitting2fa = ref(false);
const errorMsg = ref("");
const successMsg = ref("");
const need2fa = ref(false);
const twoFaCode = ref("");

const appleId = ref("");
const password = ref("");
const riskAccepted = ref(false);
const checklistWebAccess = ref(false);
const checklistAdpOff = ref(false);
const sessionPresent = ref(false);

const consentReady = computed(
  () => riskAccepted.value && checklistWebAccess.value && checklistAdpOff.value
);

const canSubmitLogin = computed(
  () =>
    consentReady.value &&
    appleId.value.trim().length > 0 &&
    password.value.length > 0 &&
    !loggingIn.value &&
    !need2fa.value
);

/** 合并 consent 与 appleId 写入 settings.json（不含密码） */
async function persistConsentSettings() {
  const current = await getIcloudSyncSettings();
  const next: IcloudSyncSettings = {
    ...current,
    appleId: appleId.value.trim(),
    riskAccepted: riskAccepted.value,
    checklistWebAccess: checklistWebAccess.value,
    checklistAdpOff: checklistAdpOff.value
  };
  await saveIcloudSyncSettings(next);
}

async function loadState() {
  if (!isTauri()) return;
  loading.value = true;
  errorMsg.value = "";
  try {
    const [authState, settings] = await Promise.all([
      getIcloudSyncAuthState(),
      getIcloudSyncSettings()
    ]);
    appleId.value = authState.appleId || settings.appleId || "";
    riskAccepted.value = authState.riskAccepted;
    checklistWebAccess.value = authState.checklistWebAccess;
    checklistAdpOff.value = authState.checklistAdpOff;
    sessionPresent.value = authState.sessionPresent;
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    loading.value = false;
  }
}

function resetTransient() {
  errorMsg.value = "";
  successMsg.value = "";
  need2fa.value = false;
  twoFaCode.value = "";
  password.value = "";
}

async function onLogin() {
  if (!canSubmitLogin.value) return;
  loggingIn.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  need2fa.value = false;
  try {
    await setIcloudSyncCredentials(appleId.value.trim(), password.value);
    await persistConsentSettings();
    const result = await loginIcloudSync();
    if (result.status === "need_2fa") {
      need2fa.value = true;
      successMsg.value = "已向受信任设备发送验证码，请输入 6 位验证码";
      return;
    }
    successMsg.value = "登录成功";
    password.value = "";
    sessionPresent.value = true;
    emit("loggedIn");
    window.setTimeout(() => {
      open.value = false;
    }, 600);
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    loggingIn.value = false;
  }
}

async function onSubmit2fa() {
  const code = twoFaCode.value.trim();
  if (!code) {
    errorMsg.value = "请输入验证码";
    return;
  }
  submitting2fa.value = true;
  errorMsg.value = "";
  try {
    const result = await submitIcloudSync2fa(code);
    if (result.status === "need_2fa") {
      errorMsg.value = "仍需验证码，请重试";
      return;
    }
    need2fa.value = false;
    twoFaCode.value = "";
    successMsg.value = "验证成功，已登录";
    sessionPresent.value = true;
    emit("loggedIn");
    window.setTimeout(() => {
      open.value = false;
    }, 600);
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    submitting2fa.value = false;
  }
}

function onClose() {
  resetTransient();
}

watch(open, value => {
  if (value) {
    resetTransient();
    void loadState();
  }
});
</script>

<template>
  <a-modal
    v-model:open="open"
    title="Apple ID 登录"
    :width="560"
    :footer="null"
    destroy-on-close
    wrap-class-name="icloud-auth-modal-wrap"
    @cancel="onClose"
  >
    <div class="auth-modal-body">
      <div v-if="sessionPresent" class="info-banner">
        检测到本地 session 文件；若同步中途失效，请重新登录后再继续任务。
      </div>

      <section class="section">
        <h4 class="section-title">风险告知（必勾选）</h4>
        <p class="section-desc">
          本工具通过非官方接口访问 iCloud 照片，可能违反 Apple 服务条款，存在账号被临时锁定等风险。使用主号前请充分了解后果。
        </p>
        <label class="check-row">
          <input v-model="riskAccepted" type="checkbox" class="check-input" />
          <span>我已了解上述风险，并自愿承担后果</span>
        </label>
      </section>

      <section class="section">
        <h4 class="section-title">账号清单（必勾选）</h4>
        <label class="check-row">
          <input v-model="checklistWebAccess" type="checkbox" class="check-input" />
          <span>我已在 Apple ID 设置中开启「网页访问 iCloud 数据」</span>
        </label>
        <label class="check-row">
          <input v-model="checklistAdpOff" type="checkbox" class="check-input" />
          <span>我已关闭 Advanced Data Protection（高级数据保护）</span>
        </label>
      </section>

      <section class="section">
        <h4 class="section-title">凭据</h4>
        <div class="form-item">
          <label class="form-label">Apple ID</label>
          <input
            v-model="appleId"
            type="email"
            class="text-input"
            placeholder="name@example.com"
            autocomplete="username"
            spellcheck="false"
            :disabled="need2fa || loggingIn || loading"
          />
        </div>
        <div class="form-item">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            class="text-input"
            placeholder="Apple ID 密码"
            autocomplete="current-password"
            :disabled="need2fa || loggingIn || loading"
          />
          <p class="form-hint">密码仅保存在本机钥匙串，不会上传服务器</p>
        </div>
      </section>

      <section v-if="need2fa" class="section section-2fa">
        <h4 class="section-title">双重认证</h4>
        <div class="form-item">
          <label class="form-label">验证码</label>
          <input
            v-model="twoFaCode"
            type="text"
            class="text-input"
            placeholder="6 位数字"
            inputmode="numeric"
            maxlength="8"
            autocomplete="one-time-code"
          />
        </div>
        <button
          type="button"
          class="primary-btn"
          :disabled="submitting2fa || !twoFaCode.trim()"
          @click="onSubmit2fa"
        >
          {{ submitting2fa ? "提交中..." : "提交验证码" }}
        </button>
      </section>

      <p v-if="errorMsg" class="msg-error">{{ errorMsg }}</p>
      <p v-if="successMsg" class="msg-success">{{ successMsg }}</p>

      <div v-if="!need2fa" class="form-actions">
        <button type="button" class="primary-btn" :disabled="!canSubmitLogin || loading" @click="onLogin">
          {{ loggingIn ? "登录中..." : "登录" }}
        </button>
      </div>

      <p v-if="!consentReady" class="form-hint consent-hint">请先勾选风险告知与账号清单，才能发起登录。</p>
    </div>
  </a-modal>
</template>

<style scoped lang="scss">
.auth-modal-body {
  max-height: min(70vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
}
.info-banner {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(22, 136, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  line-height: 1.5;
}
.section {
  margin-bottom: 20px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
}
.section-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.45);
}
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  user-select: none;
}
.check-input {
  margin-top: 2px;
  flex-shrink: 0;
}
.form-item {
  margin-bottom: 12px;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}
.text-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #16181d;
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  &:focus {
    border-color: #1688ff;
  }
  &:disabled {
    opacity: 0.6;
  }
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}
.consent-hint {
  margin-top: 12px;
  color: rgba(255, 180, 80, 0.85);
}
.msg-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: #ff7875;
  line-height: 1.5;
}
.msg-success {
  margin: 0 0 12px;
  font-size: 13px;
  color: #73d13d;
}
.form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.primary-btn {
  height: 36px;
  padding: 0 24px;
  border: 0;
  border-radius: 6px;
  background: #1688ff;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #0e7ae6;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.section-2fa {
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
</style>

<style lang="scss">
.icloud-auth-modal-wrap .ant-modal-content {
  background: #1f2329;
  color: rgba(255, 255, 255, 0.88);
}
.icloud-auth-modal-wrap .ant-modal-header {
  background: #1f2329;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.icloud-auth-modal-wrap .ant-modal-title {
  color: rgba(255, 255, 255, 0.88);
}
.icloud-auth-modal-wrap .ant-modal-close {
  color: rgba(255, 255, 255, 0.55);
}
</style>
