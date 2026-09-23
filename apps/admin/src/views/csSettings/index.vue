<!--
  CS 应用设置
  职责：开机自启、关闭到托盘、AI 接入、相册根目录与备份源落盘路径
  主流程：拉取 → 编辑 → 保存
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getAppSettings, hasAppAiApiKey, saveAppSettings, setAppAiApiKey, type AppSettings } from "@/api/appSettings";
import { formatIcloudSyncError } from "@/api/icloudSync";
import CsSaveBar from "@/components/CsSaveBar/index.vue";
import { isTauri } from "@/utils/tauri";
import $feedback from "@/utils/feedback";

defineOptions({ name: "CsAppSettings" });

const route = useRoute();
const router = useRouter();
const fromSync = computed(() => route.query.from === "sync");

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

// 相册设置 state
const rootDir = ref("");

async function load() {
  if (!isTauri()) return;
  loading.value = true;
  try {
    Object.assign(form, await getAppSettings());
    hasKey.value = await hasAppAiApiKey();
    await loadAlbumSettings();
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    loading.value = false;
  }
}

async function loadAlbumSettings() {
  try {
    const albumSettings = await invoke<{ rootDir: string }>("album_get_settings");
    rootDir.value = albumSettings.rootDir || "";
  } catch (e) {
    console.error("Failed to load album settings:", e);
    if (isTauri()) {
      $feedback.message.error(formatIcloudSyncError(e));
    }
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
    } else {
      hasKey.value = await hasAppAiApiKey();
    }

    // 相册设置保存（失败已提示，不重复 success）
    if (isTauri()) {
      const ok = await saveAlbumSettings();
      if (!ok) return;
    }

    $feedback.message.success(hasKey.value ? "已保存（已有 Key）" : "已保存（尚未配置 API Key）");
    if (fromSync.value) {
      router.push("/album/gallery");
    }
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    saving.value = false;
  }
}

/** 保存相册设置：校验 + 写入 album root；失败返回 false */
async function saveAlbumSettings(): Promise<boolean> {
  if (!rootDir.value.trim()) {
    $feedback.message.warning("请先选择相册根目录");
    return false;
  }
  try {
    await invoke("album_save_settings", {
      settings: {
        rootDir: rootDir.value.trim()
      }
    });
    return true;
  } catch (e: unknown) {
    const msg = isTauri() ? formatIcloudSyncError(e) : typeof e === "string" ? e : "保存失败";
    $feedback.message.error(msg);
    return false;
  }
}

async function browseRootDir() {
  try {
    const selected = await open({ directory: true, multiple: false, title: "选择相册根目录" });
    if (typeof selected === "string") {
      rootDir.value = selected;
    }
  } catch (e) {
    console.error("Dialog error:", e);
  }
}

async function clearKey() {
  await setAppAiApiKey("");
  hasKey.value = false;
  $feedback.message.success("已清除 API Key");
}

onMounted(load);
// 无 keep-alive 时切回会 remount；有缓存时用 activated 再刷一次钥匙串状态
onActivated(load);
</script>

<template>
  <div class="h-full overflow-auto bg-[var(--fill-color)]">
    <a-spin :spinning="loading">
    <div class="box-border flex flex-col gap-16px px-16px pb-72px pt-16px">
    <a-alert
      v-if="fromSync"
      type="info"
      show-icon
      class="mb-16px"
      message="从 iCloud 同步页跳转而来"
      description="确认相册根目录与落盘路径后保存，将自动返回同步页。"
    />
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
              Key 存系统钥匙串
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
            <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">未配置 Key 时不会调用 AI 模型。</p>
          </a-form-item>
        </a-form>
      </a-card>

      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex flex-wrap items-center justify-between gap-16px text-14px font-600">
            <span>相册</span>
            <span class="text-12px font-400 text-[var(--color-text-tertiary)]">根目录与备份源落盘路径</span>
          </div>
        </template>
        <a-form :label-col="{ style: { width: '120px' } }">
          <a-form-item label="相册根目录" required>
            <div class="flex w-full gap-8px">
              <a-input v-model:value="rootDir" placeholder="选择或输入相册根目录路径" spellcheck="false" :disabled="loading" />
              <a-button :disabled="loading" @click="browseRootDir">浏览</a-button>
            </div>
            <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">从该目录开始递归扫描，按子目录分组展示媒体文件</p>
          </a-form-item>

          <template v-if="isTauri()">
            <a-divider orientation="left">iCloud 同步</a-divider>

            <a-form-item label="落盘目录">
              <p class="mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">
                固定路径：相册根/iCloudSync/&lt;Apple ID&gt;/；文件名 yyyyMMdd_HHmmss + 资源 id，不含账号段
              </p>
            </a-form-item>

            <a-divider orientation="left">QQ 空间同步</a-divider>

            <a-form-item label="落盘目录">
              <p class="mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">
                固定路径：相册根/QzoneSync/&lt;QQ号&gt;/&lt;相册&gt;/；文件名 yyyyMMdd_HHmmss + 资源 id，不含账号段
              </p>
            </a-form-item>
          </template>
        </a-form>
      </a-card>
    </div>

    <CsSaveBar :saving="saving" @reload="load" @save="onSave" />
    </div>
  </a-spin>
  </div>
</template>

<style scoped lang="scss">
.section-card {
  :deep(.ant-card-head) {
    padding: 12px 16px;
    min-height: auto;
  }
}
</style>
