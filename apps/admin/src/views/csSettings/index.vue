<!--
  CS 应用设置
  职责：开机自启、关闭到托盘、AI 接入
  主流程：拉取 → 编辑 → 保存；可跳转日报 Prompt 设置
-->
<script setup lang="ts">
import { getAppSettings, hasAppAiApiKey, saveAppSettings, setAppAiApiKey, type AppSettings } from "@/api/appSettings";
import CsSaveBar from "@/components/CsSaveBar/index.vue";
import { isTauri } from "@/utils/tauri";
import $feedback from "@/utils/feedback";

defineOptions({ name: "CsAppSettings" });

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const hasKey = ref(false);
const apiKeyInput = ref("");

const form = reactive<AppSettings>({
  minimizeToTrayOnClose: true,
  autostart: false,
  modelBaseUrl: "https://api.openai.com/v1",
  modelName: "gpt-4o-mini",
  callAiWhenEmpty: false
});

async function load() {
  if (!isTauri()) return;
  loading.value = true;
  try {
    Object.assign(form, await getAppSettings());
    hasKey.value = await hasAppAiApiKey();
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await saveAppSettings({ ...form });
    if (apiKeyInput.value.trim()) {
      await setAppAiApiKey(apiKeyInput.value.trim());
      apiKeyInput.value = "";
      // 以读回为准，避免「写成功假象」
      hasKey.value = await hasAppAiApiKey();
      if (!hasKey.value) {
        $feedback.message.error("Key 写入后无法读回，请重试或检查系统凭据权限");
        return;
      }
      $feedback.message.success("已保存（API Key 已写入）");
    } else {
      hasKey.value = await hasAppAiApiKey();
      $feedback.message.success(hasKey.value ? "已保存（已有 Key）" : "已保存（尚未配置 API Key，日报不会调模型）");
    }
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    saving.value = false;
  }
}

async function clearKey() {
  await setAppAiApiKey("");
  hasKey.value = false;
  $feedback.message.success("已清除 API Key");
}

function goDailySettings() {
  router.push("/daily-report/settings");
}

onMounted(load);
// 无 keep-alive 时切回会 remount；有缓存时用 activated 再刷一次钥匙串状态
onActivated(load);
</script>

<template>
  <a-spin :spinning="loading">
    <div class="box-border flex h-full flex-col gap-16px overflow-auto bg-[var(--fill-color)] px-16px pb-72px pt-16px">
    <div class="flex flex-col gap-16px">
      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-16px text-14px font-600">
            <span>客户端</span>
            <span class="text-12px font-400 text-[var(--color-text-tertiary)]">窗口与启动行为</span>
          </div>
        </template>
        <a-form :label-col="{ style: { width: '120px' } }">
          <a-form-item label="关闭到托盘">
            <div class="flex flex-wrap items-center gap-16px">
              <a-switch v-model:checked="form.minimizeToTrayOnClose" />
              <span class="text-12px leading-normal text-[var(--color-text-tertiary)]"> 开启后点关闭会隐藏到托盘，需托盘菜单「退出」才真正退出 </span>
            </div>
          </a-form-item>
          <a-form-item label="开机自启">
            <a-switch v-model:checked="form.autostart" />
          </a-form-item>
        </a-form>
      </a-card>

      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-16px text-14px font-600">
            <span>AI 接入</span>
            <span class="text-12px font-400 text-[var(--color-text-tertiary)]">
              Key 存系统钥匙串；Prompt 在
              <button type="button" class="inline-link" @click="goDailySettings">日报设置</button>
            </span>
          </div>
        </template>
        <a-form :label-col="{ style: { width: '120px' } }">
          <a-form-item label="Base URL">
            <a-input v-model:value="form.modelBaseUrl" placeholder="https://api.openai.com/v1" />
          </a-form-item>
          <a-form-item label="Model">
            <a-input v-model:value="form.modelName" />
          </a-form-item>
          <a-form-item label="API Key">
            <div class="flex w-full gap-8px">
              <a-input-password v-model:value="apiKeyInput" :placeholder="hasKey ? '已配置（输入则覆盖）' : '未配置'" />
              <a-button v-if="hasKey" @click="clearKey">清除</a-button>
            </div>
            <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">未配置 Key 时日报只展示扫描日志，不调用模型。</p>
          </a-form-item>
        </a-form>
      </a-card>
    </div>

    <CsSaveBar :saving="saving" @reload="load" @save="onSave" />
    </div>
  </a-spin>
</template>

<style scoped lang="scss">
.section-card {
  :deep(.ant-card-head) {
    padding: 12px 16px;
    min-height: auto;
  }
}
.inline-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: inherit;
  &:hover {
    text-decoration: underline;
  }
}
</style>
