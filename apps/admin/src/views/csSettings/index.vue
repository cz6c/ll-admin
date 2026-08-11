<!--
  CS 应用设置
  职责：开机自启、关闭到托盘、AI 接入
  主流程：拉取 → 编辑 → 保存；可跳转日报 Prompt 设置
-->
<script setup lang="ts">
import { getAppSettings, hasAppAiApiKey, saveAppSettings, setAppAiApiKey, type AppSettings } from "@/api/appSettings";
import CsSaveBar from "@/components/CsSaveBar/index.vue";
import { isTauri } from "@/utils/tauri";

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
    ElMessage.error(e?.message || String(e));
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
        ElMessage.error("Key 写入后无法读回，请重试或检查系统凭据权限");
        return;
      }
      ElMessage.success("已保存（API Key 已写入）");
    } else {
      hasKey.value = await hasAppAiApiKey();
      ElMessage.success(hasKey.value ? "已保存（已有 Key）" : "已保存（尚未配置 API Key，日报不会调模型）");
    }
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    saving.value = false;
  }
}

async function clearKey() {
  await setAppAiApiKey("");
  hasKey.value = false;
  ElMessage.success("已清除 API Key");
}

function goDailySettings() {
  router.push("/daily-report/settings");
}

onMounted(load);
// 无 keep-alive 时切回会 remount；有缓存时用 activated 再刷一次钥匙串状态
onActivated(load);
</script>

<template>
  <div
    v-loading="loading"
    class="box-border flex h-full flex-col gap-12px overflow-auto bg-[var(--el-bg-color-page,#f5f7fa)] px-12px pb-72px pt-12px"
  >
    <div class="flex flex-col gap-12px">
      <el-card shadow="never" class="section-card card-rounded">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-12px text-14px font-600">
            <span>客户端</span>
            <span class="text-12px font-400 text-[var(--el-text-color-secondary)]">窗口与启动行为</span>
          </div>
        </template>
        <el-form label-width="120px">
          <el-form-item label="关闭到托盘">
            <div class="flex flex-wrap items-center gap-12px">
              <el-switch v-model="form.minimizeToTrayOnClose" />
              <span class="text-12px leading-normal text-[var(--el-text-color-secondary)]"> 开启后点关闭会隐藏到托盘，需托盘菜单「退出」才真正退出 </span>
            </div>
          </el-form-item>
          <el-form-item label="开机自启">
            <el-switch v-model="form.autostart" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="section-card card-rounded">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-12px text-14px font-600">
            <span>AI 接入</span>
            <span class="text-12px font-400 text-[var(--el-text-color-secondary)]">
              Key 存系统钥匙串；Prompt 在
              <button type="button" class="inline-link" @click="goDailySettings">日报设置</button>
            </span>
          </div>
        </template>
        <el-form label-width="120px">
          <el-form-item label="Base URL">
            <el-input v-model="form.modelBaseUrl" placeholder="https://api.openai.com/v1" />
          </el-form-item>
          <el-form-item label="Model">
            <el-input v-model="form.modelName" />
          </el-form-item>
          <el-form-item label="API Key">
            <div class="flex w-full gap-8px">
              <el-input v-model="apiKeyInput" type="password" show-password :placeholder="hasKey ? '已配置（输入则覆盖）' : '未配置'" />
              <el-button v-if="hasKey" @click="clearKey">清除</el-button>
            </div>
            <p class="mt-6px mb-0 text-12px leading-normal text-[var(--el-text-color-secondary)]">未配置 Key 时日报只展示扫描日志，不调用模型。</p>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <CsSaveBar :saving="saving" @reload="load" @save="onSave" />
  </div>
</template>

<style scoped lang="scss">
.section-card {
  :deep(.el-card__header) {
    padding: 12px 16px;
  }
}
.inline-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: inherit;
  &:hover {
    text-decoration: underline;
  }
}
</style>
