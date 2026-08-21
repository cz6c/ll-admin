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
  saveIcloudSyncSettings,
  type IcloudSyncSettings
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumSettings" });

const rootDir = ref("");
const outputDir = ref("");
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
      const [icloudSettings, albumRoot] = await Promise.all([
        getIcloudSyncSettings(),
        getAlbumRootForDefault()
      ]);
      cachedIcloudSettings = icloudSettings;
      outputDir.value = icloudSettings.outputDir || "";
      const suggested = buildDefaultOutputDir(albumRoot || rootDir.value);
      defaultHint.value = suggested
        ? `未填写时将默认使用：${suggested}`
        : "请先配置相册根目录，或在此填写绝对路径";
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
        concurrency: 1
      };
      await saveIcloudSyncSettings(next);
      cachedIcloudSettings = next;
      outputDir.value = next.outputDir;
    }

    message.success("设置已保存");
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
  <div class="album-settings">
    <div class="settings-card">
      <h3 class="card-title">相册设置</h3>

      <div class="form-item">
        <label class="form-label">相册根目录</label>
        <div class="dir-input-row">
          <input
            v-model="rootDir"
            type="text"
            class="dir-input"
            placeholder="选择或输入相册根目录路径"
            spellcheck="false"
            :disabled="loading"
          />
          <button type="button" class="browse-btn" :disabled="loading" @click="browseRootDir">浏览</button>
        </div>
        <p class="form-hint">从该目录开始递归扫描，按子目录分组展示媒体文件</p>
      </div>

      <template v-if="isTauri()">
        <div class="section-divider" />
        <h4 class="section-title">iCloud 同步</h4>

        <div class="form-item">
          <label class="form-label">落盘目录</label>
          <div class="dir-input-row">
            <input
              v-model="outputDir"
              type="text"
              class="dir-input"
              placeholder="留空则使用相册根目录下的 iCloudSync 子文件夹"
              spellcheck="false"
              :disabled="loading"
            />
            <button type="button" class="browse-btn" :disabled="loading" @click="browseOutputDir">浏览</button>
          </div>
          <p class="form-hint">{{ defaultHint }}</p>
        </div>

        <div class="form-item form-item-disabled">
          <label class="form-label">并发下载数</label>
          <input value="1" type="number" class="dir-input dir-input-short" min="1" max="3" disabled />
          <p class="form-hint p1-hint">P0 固定串行下载；并发 2–3 将在 P1 版本开放</p>
        </div>
      </template>

      <p v-if="errorMsg" class="msg-error">{{ errorMsg }}</p>

      <div class="form-actions">
        <button type="button" class="save-btn" :disabled="saving || loading" @click="save">
          {{ saving ? "保存中..." : "保存" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.album-settings {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: #16181d;
}
.settings-card {
  max-width: 560px;
  background: #1f2329;
  border-radius: 10px;
  padding: 24px;
}
.card-title {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}
.section-divider {
  height: 1px;
  margin: 8px 0 20px;
  background: rgba(255, 255, 255, 0.06);
}
.section-title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
}
.form-item {
  margin-bottom: 24px;
}
.form-item-disabled {
  opacity: 0.65;
}
.form-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}
.dir-input-row {
  display: flex;
  gap: 8px;
}
.dir-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: #16181d;
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  outline: none;
  &:focus {
    border-color: #1688ff;
  }
  &:disabled {
    cursor: not-allowed;
  }
  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
}
.dir-input-short {
  max-width: 80px;
  flex: none;
}
.browse-btn {
  height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.form-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}
.p1-hint {
  color: rgba(255, 255, 255, 0.45);
}
.msg-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: #ff7875;
}
.form-actions {
  margin-top: 8px;
}
.save-btn {
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
</style>
