<!--
  iCloud 同步 — Apple ID 登录弹窗
  职责：ToS + 账号清单、凭据、2FA；已登录态仅展示账号与主动退出
  主流程：打开拉 auth → 未登录填表 login → 已登录仅可 logout → logout 后才可再次 login
-->
<script setup lang="ts">
import {
  formatIcloudSyncError,
  formatIcloudSyncAuthDiagnosticCopy,
  getIcloudSyncAuthDiagnostic,
  getIcloudSyncAuthState,
  getIcloudSyncSettings,
  loginIcloudSync,
  logoutIcloudSync,
  parseIcloudSyncAuthDiagnostic,
  saveIcloudSyncSettings,
  setIcloudSyncCredentials,
  submitIcloudSync2fa,
  type IcloudSyncAuthDiagnostic,
  type IcloudSyncLoginResult,
  type IcloudSyncSettings
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "IcloudSyncAuthModal" });

const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  /** accountChanged：本次登录变更了 Apple ID（旧同步任务不可续传） */
  loggedIn: [payload: { accountChanged: boolean }];
  /** 主动退出后触发，供同步页刷新登录态 */
  loggedOut: [];
}>();

const loading = ref(false);
const loggingIn = ref(false);
const loggingOut = ref(false);
const submitting2fa = ref(false);
const errorMsg = ref("");
const successMsg = ref("");
const need2fa = ref(false);
const twoFaCode = ref("");
const twoFaDeliveryMethod = ref("");
const twoFaDetail = ref("");
const authDiagnostic = ref<IcloudSyncAuthDiagnostic | null>(null);
const diagnosticExpanded = ref<string[]>([]);
const copyingDiagnostic = ref(false);

const diagnosticJson = computed(() =>
  authDiagnostic.value ? formatIcloudSyncAuthDiagnosticCopy(authDiagnostic.value) : ""
);

/** 将 sidecar 结构化 error 转为 UI 文案并展开诊断面板 */
function applyAuthFailure(result: IcloudSyncLoginResult) {
  const code = result.errorCode?.trim() || "auth_failed";
  const detail = result.detail?.trim() ?? "";
  errorMsg.value = formatIcloudSyncError(detail ? `${code}: ${detail}` : code);
  const parsed = parseIcloudSyncAuthDiagnostic(result.diagnostic);
  if (parsed) {
    authDiagnostic.value = parsed;
    diagnosticExpanded.value = ["diag"];
  }
}

function storeDiagnosticFromResult(result: IcloudSyncLoginResult) {
  const parsed = parseIcloudSyncAuthDiagnostic(result.diagnostic);
  if (parsed) authDiagnostic.value = parsed;
}

async function loadStoredDiagnostic() {
  if (!isTauri()) return;
  try {
    const result = await getIcloudSyncAuthDiagnostic();
    if (result.status === "diagnostic") {
      const parsed = parseIcloudSyncAuthDiagnostic(result.diagnostic);
      if (parsed?.hints?.length || parsed?.userActions?.length) {
        authDiagnostic.value = parsed;
        diagnosticExpanded.value = ["diag"];
      }
    }
  } catch {
    /* 无历史诊断时忽略 */
  }
}

async function copyDiagnosticReport() {
  if (!authDiagnostic.value) return;
  copyingDiagnostic.value = true;
  try {
    await navigator.clipboard.writeText(diagnosticJson.value);
    successMsg.value = "诊断报告已复制到剪贴板";
  } catch {
    errorMsg.value = "复制失败，请手动选中下方 JSON 复制";
  } finally {
    copyingDiagnostic.value = false;
  }
}

const appleId = ref("");
const password = ref("");
const initialAppleId = ref("");
const pendingAccountChanged = ref(false);
const riskAccepted = ref(false);
const checklistWebAccess = ref(false);
const checklistAdpOff = ref(false);
/** iCloud 根域：中国大陆账号选 cn，海外账号选 com */
const icloudDomain = ref<"com" | "cn">("cn");
const isLoggedIn = ref(false);

const icloudDomainOptions = [
  {
    value: "cn" as const,
    label: "中国大陆（iCloud.com.cn）",
    description: "Apple ID 注册地在中国大陆，或 icloud.com.cn 可正常访问"
  },
  {
    value: "com" as const,
    label: "国际（iCloud.com）",
    description: "海外 Apple ID，或账号不在中国区 iCloud 分区"
  }
];

const accountSwitchPending = computed(() => {
  const next = appleId.value.trim().toLowerCase();
  const prev = initialAppleId.value.trim().toLowerCase();
  return prev.length > 0 && next.length > 0 && prev !== next;
});

const consentReady = computed(
  () => riskAccepted.value && checklistWebAccess.value && checklistAdpOff.value
);

const isTrustedDevice2fa = computed(() => twoFaDeliveryMethod.value !== "sms");

/** 受信任设备 / 设备验证路径的操作步骤（「点允许」发生在 iPhone，非本机 API） */
const deviceVerificationSteps = [
  "登录成功后，iPhone/iPad 会弹出「设备验证」或登录请求",
  "在手机上点「允许」（或「同意」）",
  "设备屏幕会显示 6 位数字，在本页输入",
  "点击「提交验证码」"
] as const;

function applyNeed2faResult(result: IcloudSyncLoginResult) {
  need2fa.value = true;
  twoFaDeliveryMethod.value = result.deliveryMethod?.trim() ?? "";
  const sms = twoFaDeliveryMethod.value === "sms";
  twoFaDetail.value =
    result.detail?.trim() ||
    (sms
      ? "请输入发送到受信任设备或手机的 6 位验证码"
      : "iPhone 将弹出「设备验证」：请先在手机上点「允许」，再将设备上显示的 6 位验证码输入下方");
  successMsg.value = "";
  storeDiagnosticFromResult(result);
}

const canSubmit2fa = computed(
  () => need2fa.value && twoFaCode.value.trim().length > 0 && !submitting2fa.value
);

const canSubmitLogin = computed(
  () =>
    !isLoggedIn.value &&
    consentReady.value &&
    appleId.value.trim().length > 0 &&
    password.value.length > 0 &&
    !loggingIn.value &&
    !need2fa.value
);

const maskedAppleId = computed(() => {
  const id = appleId.value.trim();
  if (!id.includes("@")) return id || "—";
  const [local, domain] = id.split("@");
  const head = local.length <= 2 ? (local[0] ?? "") : local.slice(0, 2);
  return `${head}***@${domain}`;
});

/** 合并 consent 与 appleId 写入 settings.json（不含密码） */
async function persistConsentSettings() {
  const current = await getIcloudSyncSettings();
  const next: IcloudSyncSettings = {
    ...current,
    appleId: appleId.value.trim(),
    riskAccepted: riskAccepted.value,
    checklistWebAccess: checklistWebAccess.value,
    checklistAdpOff: checklistAdpOff.value,
    icloudDomain: icloudDomain.value
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
    initialAppleId.value = appleId.value.trim();
    riskAccepted.value = authState.riskAccepted;
    checklistWebAccess.value = authState.checklistWebAccess;
    checklistAdpOff.value = authState.checklistAdpOff;
    icloudDomain.value =
      settings.icloudDomain === "com" || settings.icloudDomain === "cn"
        ? settings.icloudDomain
        : authState.icloudDomain === "com"
          ? "com"
          : "cn";
    isLoggedIn.value = authState.loggedIn;
    await loadStoredDiagnostic();
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
  twoFaDeliveryMethod.value = "";
  twoFaDetail.value = "";
  password.value = "";
}

async function onLogin() {
  if (!canSubmitLogin.value) return;
  loggingIn.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  need2fa.value = false;
  try {
    const accountChanged = await setIcloudSyncCredentials(appleId.value.trim(), password.value);
    pendingAccountChanged.value = accountChanged;
    await persistConsentSettings();
    const result = await loginIcloudSync();
    if (result.status === "error") {
      applyAuthFailure(result);
      return;
    }
    if (result.status === "need_2fa") {
      applyNeed2faResult(result);
      return;
    }
    successMsg.value = accountChanged ? "已切换 Apple ID 并登录成功" : "登录成功";
    password.value = "";
    isLoggedIn.value = true;
    initialAppleId.value = appleId.value.trim();
    emit("loggedIn", { accountChanged });
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
    errorMsg.value = isTrustedDevice2fa.value
      ? "请输入 iPhone 上显示的 6 位验证码"
      : "请输入验证码";
    return;
  }
  submitting2fa.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    const result = await submitIcloudSync2fa(code);
    if (result.status === "error") {
      applyAuthFailure(result);
      return;
    }
    if (result.status === "need_2fa") {
      applyNeed2faResult(result);
      errorMsg.value = "仍需完成二次验证，请重试";
      return;
    }
    need2fa.value = false;
    twoFaCode.value = "";
    successMsg.value = pendingAccountChanged.value ? "已切换 Apple ID 并验证成功" : "验证成功，已登录";
    isLoggedIn.value = true;
    initialAppleId.value = appleId.value.trim();
    emit("loggedIn", { accountChanged: pendingAccountChanged.value });
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
  pendingAccountChanged.value = false;
}

async function onLogout() {
  loggingOut.value = true;
  errorMsg.value = "";
  successMsg.value = "";
  try {
    await logoutIcloudSync(true);
    isLoggedIn.value = false;
    password.value = "";
    successMsg.value = "已退出登录，可重新填写凭据登录";
    emit("loggedOut");
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    loggingOut.value = false;
  }
}

watch(open, value => {
  if (value) {
    resetTransient();
    pendingAccountChanged.value = false;
    void loadState();
  }
});
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="isLoggedIn && !need2fa ? 'Apple ID 已登录' : 'Apple ID 登录'"
    :width="560"
    :footer="null"
    destroy-on-close
    @cancel="onClose"
  >
    <a-spin :spinning="loading">
      <div class="auth-modal-body">
        <!-- 已登录：仅展示账号 + 主动退出 -->
        <template v-if="isLoggedIn && !need2fa">
          <a-alert type="success" show-icon class="mb-16px">
            <template #message>当前账号：{{ maskedAppleId }}</template>
            <template #description>
              已登录 iCloud（{{ icloudDomain === "cn" ? "中国大陆" : "国际" }}）。如需更换账号或重新输入密码，请先退出登录。
            </template>
          </a-alert>

          <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="mb-12px" />
          <a-alert v-if="successMsg" type="success" :message="successMsg" show-icon class="mb-12px" />

          <div class="form-actions">
            <a-button danger :loading="loggingOut" :disabled="loading" @click="onLogout">退出登录</a-button>
          </div>
        </template>

        <!-- 未登录（或 2FA 进行中）：完整登录表单 -->
        <template v-else>
          <a-alert
            v-if="accountSwitchPending"
            type="warning"
            show-icon
            class="mb-16px"
            message="即将切换 Apple ID"
            description="旧账号的同步任务将无法续传，请在新账号下「开始同步」。"
          />

          <section class="section">
            <h4 class="section-title">风险告知（必勾选）</h4>
            <p class="section-desc">
              本工具通过非官方接口访问 iCloud 照片，可能违反 Apple 服务条款，存在账号被临时锁定等风险。使用主号前请充分了解后果。
            </p>
            <a-checkbox v-model:checked="riskAccepted">我已了解上述风险，并自愿承担后果</a-checkbox>
          </section>

          <section class="section">
            <h4 class="section-title">账号清单（必勾选）</h4>
            <div class="check-list">
              <a-checkbox v-model:checked="checklistWebAccess">我已在 Apple ID 设置中开启「网页访问 iCloud 数据」</a-checkbox>
              <a-checkbox v-model:checked="checklistAdpOff">我已关闭 Advanced Data Protection（高级数据保护）</a-checkbox>
            </div>
          </section>

          <section class="section">
            <h4 class="section-title">iCloud 区域</h4>
            <p class="section-desc">请按 Apple ID 实际分区选择；选错区域会导致登录失败，不会自动切换。</p>
            <a-radio-group
              v-model:value="icloudDomain"
              class="domain-radio-group"
              :disabled="need2fa || loggingIn || loading"
            >
              <a-radio v-for="opt in icloudDomainOptions" :key="opt.value" :value="opt.value" class="domain-radio">
                <span class="domain-radio-label">{{ opt.label }}</span>
                <span class="domain-radio-desc">{{ opt.description }}</span>
              </a-radio>
            </a-radio-group>
          </section>

          <a-form layout="vertical" class="section">
            <h4 class="section-title">凭据</h4>
            <a-form-item label="Apple ID">
              <a-input
                v-model:value="appleId"
                type="email"
                placeholder="name@example.com"
                autocomplete="username"
                spellcheck="false"
                :disabled="need2fa || loggingIn || loading"
              />
            </a-form-item>
            <a-form-item label="密码">
              <a-input-password
                v-model:value="password"
                placeholder="Apple ID 密码"
                autocomplete="current-password"
                :disabled="need2fa || loggingIn || loading"
              />
              <p class="form-hint">密码仅保存在本机钥匙串，不会上传服务器</p>
            </a-form-item>
          </a-form>

          <section v-if="need2fa" class="section section-2fa">
            <h4 class="section-title">双重认证</h4>
            <a-alert type="info" show-icon class="mb-12px" :message="twoFaDetail" />
            <ol v-if="isTrustedDevice2fa" class="device-verify-steps mb-12px">
              <li v-for="(step, idx) in deviceVerificationSteps" :key="idx">{{ step }}</li>
            </ol>
            <a-form layout="vertical">
              <a-form-item :label="isTrustedDevice2fa ? '设备验证码' : '短信验证码'">
                <a-input
                  v-model:value="twoFaCode"
                  :placeholder="isTrustedDevice2fa ? '点「允许」后，iPhone 上显示的 6 位数字' : '6 位数字'"
                  inputmode="numeric"
                  :maxlength="8"
                  autocomplete="one-time-code"
                />
              </a-form-item>
            </a-form>
            <a-button type="primary" :loading="submitting2fa" :disabled="!canSubmit2fa" @click="onSubmit2fa">
              提交验证码
            </a-button>
            <p v-if="isTrustedDevice2fa" class="form-hint">
              「点允许」在 iPhone 上完成，本应用无法代你点击；允许后请尽快输入验证码
            </p>
            <p v-else class="form-hint">验证码有时效，收到短信后请尽快输入并提交</p>
          </section>

          <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="mb-12px" />

          <a-collapse
            v-if="authDiagnostic"
            v-model:activeKey="diagnosticExpanded"
            class="mb-12px diag-collapse"
          >
            <a-collapse-panel key="diag" header="认证诊断（失败时展开查看，可复制完整报告）">
              <ul v-if="authDiagnostic.userActions?.length" class="diag-actions">
                <li v-for="(action, idx) in authDiagnostic.userActions" :key="idx">{{ action }}</li>
              </ul>
              <div v-if="authDiagnostic.hints?.length" class="diag-hints mb-8px">
                <span class="diag-label">检测信号：</span>
                <a-tag v-for="hint in authDiagnostic.hints" :key="hint" class="diag-tag">{{ hint }}</a-tag>
              </div>
              <p v-if="authDiagnostic.message" class="diag-meta">
                {{ authDiagnostic.stage }} · {{ authDiagnostic.at ?? "—" }}
              </p>
              <pre class="diag-json">{{ diagnosticJson }}</pre>
              <a-button size="small" :loading="copyingDiagnostic" @click="copyDiagnosticReport">
                复制诊断报告
              </a-button>
            </a-collapse-panel>
          </a-collapse>

          <a-alert v-if="successMsg && !need2fa" type="success" :message="successMsg" show-icon class="mb-12px" />

          <div v-if="!need2fa" class="form-actions">
            <a-button type="primary" :loading="loggingIn" :disabled="!canSubmitLogin || loading" @click="onLogin">
              登录
            </a-button>
          </div>

          <a-alert
            v-if="!consentReady && !need2fa"
            type="warning"
            show-icon
            class="mt-12px"
            message="请先勾选风险告知与账号清单，才能发起登录。"
          />
        </template>
      </div>
    </a-spin>
  </a-modal>
</template>

<style scoped lang="scss">
.auth-modal-body {
  max-height: min(70vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
}
.section {
  margin-bottom: 20px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.section-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-tertiary);
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.device-verify-steps {
  margin: 0;
  padding-left: 20px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.domain-radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.domain-radio {
  display: flex;
  align-items: flex-start;
  margin: 0;
  :deep(.ant-radio) {
    margin-top: 2px;
  }
}
.domain-radio-label {
  display: block;
  font-size: 13px;
  color: var(--color-text);
}
.domain-radio-desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-tertiary);
}
.section-2fa {
  padding-top: 4px;
  border-top: 1px solid var(--border-color);
}
.diag-collapse {
  :deep(.ant-collapse-header) {
    font-size: 12px;
    font-weight: 600;
  }
}
.diag-actions {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.diag-hints {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.diag-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.diag-tag {
  margin: 0;
}
.diag-meta {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--color-text-tertiary);
}
.diag-json {
  max-height: 160px;
  overflow: auto;
  margin: 0 0 8px;
  padding: 8px;
  font-size: 11px;
  line-height: 1.4;
  background: var(--color-fill-quaternary, #f5f5f5);
  border-radius: 4px;
}
</style>
