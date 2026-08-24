<!--
  相册设置页
  职责：配置相册根目录、iCloud 同步落盘路径与 consent 相关设置项
-->
<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { message } from "ant-design-vue";
import {
  buildDefaultOutputDir,
  formatIcloudSyncError,
  getAlbumRootForDefault,
  getIcloudSyncSettings,
  ICLOUD_SYNC_CONCURRENCY_TIERS,
  saveIcloudSyncSettings,
  type IcloudSyncSettings
} from "@/api/icloudSync";
import CsSaveBar from "@/components/CsSaveBar/index.vue";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumSettings" });

const route = useRoute();
const router = useRouter();
const fromSync = computed(() => route.query.from === "sync");

const rootDir = ref("");
const outputDir = ref("");
const concurrency = ref(1);
const defaultHint = ref("");
const saving = ref(false);
const loading = ref(false);
const errorMsg = ref("");

/** 保留 appleId 与 consent 字段，避免覆盖 auth 弹窗已保存项 */
let cachedIcloudSettings: IcloudSyncSettings | null = null;

async function loadSettings() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const albumSettings = await invoke<{ rootDir: string }>("album_get_settings");
    rootDir.value = albumSettings.rootDir || "";

    if (isTauri()) {
      const [icloudSettings, albumRoot] = await Promise.all([getIcloudSyncSettings(), getAlbumRootForDefault()]);
      cachedIcloudSettings = icloudSettings;
      outputDir.value = icloudSettings.outputDir || "";
      concurrency.value = icloudSettings.concurrency ?? 1;
      const suggested = buildDefaultOutputDir(albumRoot || rootDir.value);
      defaultHint.value = suggested ? `未填写时将默认使用：${suggested}` : "请先配置相册根目录，或在此填写绝对路径";
    }
  } catch (e) {
    console.error("Failed to load album settings:", e);
    if (isTauri()) {
      errorMsg.value = formatIcloudSyncError(e);
    }
  } finally {
    loading.value = false;
  }
}

async function browseRootDir() {
  try {
    const selected = await open({ directory: true, multiple: false, title: "选择相册根目录" });
    if (typeof selected === "string") {
      rootDir.value = selected;
      if (!outputDir.value.trim() && selected) {
        defaultHint.value = `未填写时将默认使用：${buildDefaultOutputDir(selected)}`;
      }
    }
  } catch (e) {
    console.error("Dialog error:", e);
  }
}

async function browseOutputDir() {
  try {
    const selected = await open({ directory: true, multiple: false, title: "选择 iCloud 同步落盘目录" });
    if (typeof selected === "string" && selected) {
      outputDir.value = selected;
    }
  } catch (e) {
    console.error("Dialog error:", e);
  }
}

async function save() {
  if (!rootDir.value.trim()) {
    message.warning("请先选择相册根目录");
    return;
  }
  if (isTauri() && !outputDir.value.trim()) {
    const suggested = buildDefaultOutputDir(rootDir.value);
    if (!suggested) {
      message.warning("请填写 iCloud 同步落盘目录");
      return;
    }
  }
  saving.value = true;
  errorMsg.value = "";
  try {
    await invoke("album_save_settings", {
      settings: {
        rootDir: rootDir.value.trim(),
        thumbSize: 158
      }
    });

    if (isTauri()) {
      const base = cachedIcloudSettings ?? (await getIcloudSyncSettings());
      const next: IcloudSyncSettings = {
        ...base,
        outputDir: outputDir.value.trim(),
        concurrency: Math.min(3, Math.max(1, concurrency.value || 1))
      };
      await saveIcloudSyncSettings(next);
      cachedIcloudSettings = next;
      outputDir.value = next.outputDir;
    }

    message.success("设置已保存");
    if (fromSync.value) {
      router.push("/album/icloudSync");
    }
  } catch (e: unknown) {
    const msg = isTauri() ? formatIcloudSyncError(e) : typeof e === "string" ? e : "保存失败";
    errorMsg.value = msg;
    message.error(msg);
  } finally {
    saving.value = false;
  }
}

onMounted(loadSettings);
</script>

<template>
  <a-spin :spinning="loading">
    <a-card class="settings-card card-rounded" :bordered="true" title="相册设置">
      <a-alert
        v-if="fromSync"
        type="info"
        show-icon
        class="mb-16px"
        message="从 iCloud 同步页跳转而来"
        description="确认相册根目录与落盘路径后保存，将自动返回同步页。"
      />
      <a-form :label-col="{ style: { width: '120px' } }" label-align="right">
        <a-form-item label="相册根目录" required>
          <div class="dir-input-row">
            <a-input v-model:value="rootDir" placeholder="选择或输入相册根目录路径" spellcheck="false" :disabled="loading" />
            <a-button :disabled="loading" @click="browseRootDir">浏览</a-button>
          </div>
          <p class="form-hint">从该目录开始递归扫描，按子目录分组展示媒体文件</p>
        </a-form-item>

        <template v-if="isTauri()">
          <a-divider orientation="left">iCloud 同步</a-divider>

          <a-form-item label="落盘目录">
            <div class="dir-input-row">
              <a-input v-model:value="outputDir" placeholder="留空则使用相册根目录下的 iCloudSync 子文件夹" spellcheck="false" :disabled="loading" />
              <a-button :disabled="loading" @click="browseOutputDir">浏览</a-button>
            </div>
            <p class="form-hint">{{ defaultHint }}</p>
          </a-form-item>

          <a-form-item label="下载速度">
            <a-radio-group v-model:value="concurrency" :disabled="loading">
              <a-radio v-for="tier in ICLOUD_SYNC_CONCURRENCY_TIERS" :key="tier.value" :value="tier.value">
                {{ tier.label }}（{{ tier.value }}）
              </a-radio>
            </a-radio-group>
            <p class="form-hint">
              {{ ICLOUD_SYNC_CONCURRENCY_TIERS.find(t => t.value === concurrency)?.hint ?? "建议标准档" }}
            </p>
          </a-form-item>
        </template>
      </a-form>

      <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="mb-12px" />

      <CsSaveBar :saving="saving" @reload="loadSettings" @save="save" />
    </a-card>
  </a-spin>
</template>

<style scoped lang="scss">
.settings-card {
  :deep(.ant-card-head) {
    min-height: auto;
    padding: 12px 16px;
  }
}
.dir-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.mb-16px {
  margin-bottom: 16px;
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
