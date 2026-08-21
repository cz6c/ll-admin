<!--
  相册 — iCloud 同步页
  职责：图库全量同步、进度展示、登录失效时弹窗重登；设置项在相册设置页
  主流程：恢复 jobId → 监听 progress / job-status → start/resume
-->
<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import IcloudSyncAuthModal from "@/components/IcloudSyncAuthModal/IcloudSyncAuthModal.vue";
import {
  formatIcloudSyncError,
  getIcloudSyncJobStatus,
  ICLOUD_SYNC_ACTIVE_JOB_KEY,
  ICLOUD_SYNC_JOB_STATUS_EVENT,
  ICLOUD_SYNC_PROGRESS_EVENT,
  pauseIcloudSyncJob,
  resumeIcloudSyncJob,
  startIcloudSyncJob,
  type IcloudSyncJobStatus,
  type IcloudSyncJobStatusResult,
  type IcloudSyncProgressPayload
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSync" });

const router = useRouter();

const authModalOpen = ref(false);
const starting = ref(false);
const pausing = ref(false);
const resuming = ref(false);
const errorMsg = ref("");

const activeJobId = ref<number | null>(null);
const jobStatus = ref<IcloudSyncJobStatus | null>(null);
const progress = ref<IcloudSyncProgressPayload>({ done: 0, total: 0, filename: "" });

const isPausedSession = computed(() => jobStatus.value === "paused_session");
const isPausedUser = computed(() => jobStatus.value === "paused_user");
const isPaused = computed(() => isPausedSession.value || isPausedUser.value);
const isRunning = computed(() => jobStatus.value === "running" || starting.value || resuming.value);
const canPause = computed(() => jobStatus.value === "running" && !pausing.value);
const isDone = computed(() => jobStatus.value === "done");
const isFailed = computed(() => jobStatus.value === "failed");
const progressPercent = computed(() => {
  if (!progress.value.total) return 0;
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100));
});

function readStoredJobId(): number | null {
  try {
    const raw = localStorage.getItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function storeJobId(jobId: number | null) {
  activeJobId.value = jobId;
  try {
    if (jobId == null) {
      localStorage.removeItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
    } else {
      localStorage.setItem(ICLOUD_SYNC_ACTIVE_JOB_KEY, String(jobId));
    }
  } catch {
    /* 存储不可用时仍保留内存态 */
  }
}

/** 将 Rust 推送或 invoke 返回的状态同步到页内 UI */
function applyJobStatus(status: IcloudSyncJobStatusResult) {
  if (activeJobId.value != null && status.jobId !== activeJobId.value) return;
  jobStatus.value = status.status;
  progress.value = {
    done: status.done,
    total: status.total,
    filename: progress.value.filename
  };
  if (status.status === "done") {
    progress.value = { done: status.total, total: status.total, filename: "" };
  }
}

/** 拉取任务状态并同步进度条 */
async function refreshJobStatus(jobId: number) {
  const status = await getIcloudSyncJobStatus(jobId);
  applyJobStatus(status);
  return status;
}

async function hydrateFromStorage() {
  const jobId = readStoredJobId();
  if (jobId == null) return;
  activeJobId.value = jobId;
  try {
    await refreshJobStatus(jobId);
  } catch {
    storeJobId(null);
    jobStatus.value = null;
  }
}

async function onStart() {
  starting.value = true;
  errorMsg.value = "";
  try {
    const result = await startIcloudSyncJob();
    storeJobId(result.jobId);
    jobStatus.value = "running";
    progress.value = { done: 0, total: 0, filename: "" };
    await refreshJobStatus(result.jobId);
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    starting.value = false;
  }
}

async function onPause() {
  const jobId = activeJobId.value;
  if (jobId == null) return;
  pausing.value = true;
  errorMsg.value = "";
  try {
    await pauseIcloudSyncJob(jobId);
    await refreshJobStatus(jobId);
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    pausing.value = false;
  }
}

async function onResume() {
  const jobId = activeJobId.value;
  if (jobId == null) return;
  resuming.value = true;
  errorMsg.value = "";
  try {
    await resumeIcloudSyncJob(jobId);
    jobStatus.value = "running";
    await refreshJobStatus(jobId);
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    resuming.value = false;
  }
}

function openAuthModal() {
  authModalOpen.value = true;
}

function goSettings() {
  router.push("/album/settings");
}

let unlistenProgress: (() => void) | undefined;
let unlistenJobStatus: (() => void) | undefined;

onMounted(async () => {
  if (!isTauri()) return;
  await hydrateFromStorage();

  unlistenProgress = await listen<IcloudSyncProgressPayload>(ICLOUD_SYNC_PROGRESS_EVENT, event => {
    if (event.payload) {
      progress.value = event.payload;
    }
  });

  unlistenJobStatus = await listen<IcloudSyncJobStatusResult>(ICLOUD_SYNC_JOB_STATUS_EVENT, event => {
    if (event.payload) {
      applyJobStatus(event.payload);
    }
  });
});

onUnmounted(() => {
  unlistenProgress?.();
  unlistenJobStatus?.();
});
</script>

<template>
  <div class="icloud-sync-page">
    <div class="sync-card">
      <div class="card-head">
        <h3 class="card-title">同步 iCloud 照片</h3>
        <button type="button" class="link-btn" @click="openAuthModal">Apple ID 登录</button>
      </div>

      <div v-if="isPausedSession" class="pause-banner">
        <p class="pause-title">同步已暂停（登录失效）</p>
        <p class="pause-desc">登录状态已失效，已完成文件的进度已保留。请先重新登录，再点击「继续同步」。</p>
        <div class="pause-actions">
          <button type="button" class="primary-btn" @click="openAuthModal">重新登录</button>
          <button type="button" class="secondary-btn" :disabled="resuming" @click="onResume">
            {{ resuming ? "恢复中..." : "继续同步" }}
          </button>
        </div>
      </div>

      <div v-else-if="isPausedUser" class="pause-banner pause-banner-user">
        <p class="pause-title">同步已暂停</p>
        <p class="pause-desc">您已手动暂停同步，已完成文件的进度已保留。可随时点击「继续同步」从断点恢复。</p>
        <div class="pause-actions">
          <button type="button" class="primary-btn" :disabled="resuming" @click="onResume">
            {{ resuming ? "恢复中..." : "继续同步" }}
          </button>
        </div>
      </div>

      <div v-if="isDone" class="done-banner">同步已完成</div>
      <div v-if="isFailed" class="fail-banner">任务已失败，请检查错误信息后新建任务</div>

      <section class="section">
        <p class="form-hint scope-hint">从 iCloud 图库按拍摄时间顺序下载全部照片、视频与 Live Photo</p>
      </section>

      <section v-if="activeJobId != null && progress.total > 0" class="section">
        <h4 class="section-title">进度</h4>
        <div class="progress-bar-wrap">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }" />
        </div>
        <p class="progress-text">
          {{ progress.done }} / {{ progress.total }}
          <span v-if="progress.filename"> · {{ progress.filename }}</span>
        </p>
      </section>

      <p v-if="errorMsg" class="msg-error">{{ errorMsg }}</p>

      <div class="form-actions">
        <button type="button" class="primary-btn" :disabled="isRunning || isPaused" @click="onStart">
          {{ starting ? "启动中..." : "开始同步" }}
        </button>
        <button v-if="canPause" type="button" class="danger-btn" :disabled="pausing" @click="onPause">
          {{ pausing ? "暂停中..." : "暂停同步" }}
        </button>
        <button type="button" class="secondary-btn" @click="goSettings">同步设置</button>
      </div>

      <p v-if="isRunning" class="form-hint">下载进行中，可点击「暂停同步」随时中断…</p>
    </div>

    <IcloudSyncAuthModal v-model:open="authModalOpen" />
  </div>
</template>

<style scoped lang="scss">
.icloud-sync-page {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background: #16181d;
}
.sync-card {
  max-width: 560px;
  background: #1f2329;
  border-radius: 10px;
  padding: 24px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}
.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.88);
}
.link-btn {
  border: 0;
  background: transparent;
  color: #69b1ff;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
  &:hover {
    color: #91caff;
  }
}
.pause-banner {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 6px;
  background: rgba(250, 173, 20, 0.12);
  border: 1px solid rgba(250, 173, 20, 0.25);
}
.pause-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #ffc53d;
}
.pause-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.65);
}
.pause-banner-user {
  background: rgba(22, 136, 255, 0.1);
  border-color: rgba(22, 136, 255, 0.25);
  .pause-title {
    color: #69b1ff;
  }
}
.done-banner {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(82, 196, 26, 0.12);
  color: #73d13d;
  font-size: 13px;
}
.fail-banner {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(255, 77, 79, 0.12);
  color: #ff7875;
  font-size: 13px;
}
.section {
  margin-bottom: 20px;
}
.section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
}
.scope-hint {
  margin: 0;
  line-height: 1.5;
}
.form-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}
.progress-bar-wrap {
  height: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #1688ff;
  border-radius: 4px;
  transition: width 0.2s ease;
}
.progress-text {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.msg-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: #ff7875;
  line-height: 1.5;
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
.pause-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.danger-btn {
  height: 36px;
  padding: 0 20px;
  border: 1px solid rgba(255, 77, 79, 0.45);
  border-radius: 6px;
  background: rgba(255, 77, 79, 0.12);
  color: #ff7875;
  font-size: 13px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: rgba(255, 77, 79, 0.2);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.secondary-btn {
  height: 36px;
  padding: 0 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
