<!--
  CS 应用设置全局弹窗
  职责：开机自启、关闭到托盘、AI 接入、相册根目录与备份源落盘路径
  主流程：打开 → 拉取 → 编辑 → 保存 → 关闭
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getAppSettings, hasAppAiApiKey, saveAppSettings, setAppAiApiKey, type AppSettings } from "@/api/appSettings";
import { formatIcloudSyncError, getIcloudSyncSettings, saveIcloudSyncSettings } from "@/api/icloudSync";
import { useCsSettingsModal } from "@/composables/useCsSettingsModal";
import { isTauri } from "@/utils/tauri";
import $feedback from "@/utils/feedback";

defineOptions({ name: "SettingsModal" });

const { visible, close, notifySaved } = useCsSettingsModal();

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

const rootDir = ref("");
/** iCloud 是否合并同步 Hidden 相册（sidecar 双枚举、Rust 单 diff） */
const syncHiddenAlbum = ref(false);
/** iCloud 是否合并同步 Shared Photo Library */
const syncSharedLibrary = ref(false);

async function load() {
  if (!isTauri()) return;
  loading.value = true;
  try {
    Object.assign(form, await getAppSettings());
    hasKey.value = await hasAppAiApiKey();
    await loadAlbumSettings();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    $feedback.message.error(msg);
  } finally {
    loading.value = false;
  }
}

async function loadAlbumSettings() {
  try {
    const [albumSettings, icloudSettings] = await Promise.all([invoke<{ rootDir: string }>("album_get_settings"), getIcloudSyncSettings()]);
    rootDir.value = albumSettings.rootDir || "";
    syncHiddenAlbum.value = icloudSettings.syncHiddenAlbum === true;
    syncSharedLibrary.value = icloudSettings.syncSharedLibrary === true;
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
      hasKey.value = await hasAppAiApiKey();
      if (!hasKey.value) {
        $feedback.message.error("Key 写入后无法读回，请重试或检查系统凭据权限");
        return;
      }
    } else {
      hasKey.value = await hasAppAiApiKey();
    }

    if (isTauri()) {
      const ok = await saveAlbumSettings();
      if (!ok) return;
    }

    $feedback.message.success(hasKey.value ? "已保存（已有 Key）" : "已保存（尚未配置 API Key）");
    await notifySaved();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    $feedback.message.error(msg);
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
    const icloudSettings = await getIcloudSyncSettings();
    await saveIcloudSyncSettings({
      ...icloudSettings,
      syncHiddenAlbum: syncHiddenAlbum.value,
      syncSharedLibrary: syncSharedLibrary.value
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

watch(visible, open => {
  if (open) {
    void load();
  }
});
</script>

<template>
  <CcDialog v-model:open="visible" title="应用设置" :width="800" :mask-closable="!saving" :keyboard="!saving" @cancel="close">
    <a-spin :spinning="loading">
      <div class="cs-settings-body">
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
                <span class="text-12px font-400 text-[var(--color-text-tertiary)]"> Key 存系统钥匙串 </span>
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
                    固定路径：相册根/iCloudSync/&lt;Apple ID&gt;/；隐藏相册在 …/Hidden/ 子目录；共享图库在 …/Shared/ 子目录
                  </p>
                </a-form-item>

                <a-form-item label="同步隐藏相册">
                  <a-checkbox v-model:checked="syncHiddenAlbum">一并同步 Hidden 相册</a-checkbox>
                  <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">开启后与个人图库混排展示；关闭后不再刷新，已下载文件保留</p>
                </a-form-item>

                <a-form-item label="同步共享图库">
                  <a-checkbox v-model:checked="syncSharedLibrary">一并同步 Shared Photo Library</a-checkbox>
                  <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">开启后与个人图库混排展示；关闭后不再刷新，已下载文件保留</p>
                </a-form-item>

                <a-divider orientation="left">QQ 空间同步</a-divider>

                <a-form-item label="落盘目录">
                  <p class="mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">固定路径：相册根/QzoneSync/&lt;QQ号&gt;/&lt;相册&gt;/</p>
                </a-form-item>
              </template>
            </a-form>
          </a-card>
        </div>
      </div>
    </a-spin>

    <template #footer>
      <a-space>
        <a-button :disabled="saving" @click="close">取消</a-button>
        <a-button :disabled="saving || loading" @click="load">重新加载</a-button>
        <a-button type="primary" :loading="saving" @click="onSave">保存</a-button>
      </a-space>
    </template>
  </CcDialog>
</template>

<style scoped lang="scss">
.cs-settings-body {
  max-height: min(70vh, calc(100vh - var(--cs-shell-bar-height) - 180px));
  overflow: auto;
  padding-right: 4px;
}
.section-card {
  :deep(.ant-card-head) {
    padding: 12px 16px;
    min-height: auto;
  }
}
</style>
