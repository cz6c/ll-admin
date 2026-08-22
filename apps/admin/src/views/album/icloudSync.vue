<!--
  相册 — iCloud 同步页
  职责：图库全量同步、表格化进度展示、登录失效时弹窗重登；设置项在相册设置页
  主流程：恢复 jobId → 监听 progress / job-status → start/resume → 刷新文件任务表
-->
<script setup lang="ts">
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { listen } from "@tauri-apps/api/event";
import IcloudSyncAuthModal from "@/components/IcloudSyncAuthModal/IcloudSyncAuthModal.vue";
import {
  formatIcloudSyncError,
  getIcloudSyncAuthState,
  getIcloudSyncJobStatus,
  getIcloudSyncSettings,
  ICLOUD_SYNC_ACTIVE_JOB_KEY,
  ICLOUD_SYNC_JOB_STATUS_EVENT,
  ICLOUD_SYNC_PROGRESS_EVENT,
  listIcloudSyncAssetTasks,
  logoutIcloudSync,
  pauseIcloudSyncJob,
  resumeIcloudSyncJob,
  startIcloudSyncJob,
  type IcloudSyncAssetTaskFilter,
  type IcloudSyncAssetTaskRow,
  type IcloudSyncJobStatus,
  type IcloudSyncJobStatusResult,
  type IcloudSyncProgressPayload
} from "@/api/icloudSync";
import { isTauri } from "@/utils/tauri";

dayjs.extend(duration);

defineOptions({ name: "AlbumIcloudSync" });

const router = useRouter();

const authModalOpen = ref(false);
const loggingOut = ref(false);
const isLoggedIn = ref(false);
const starting = ref(false);
const pausing = ref(false);
const resuming = ref(false);
const errorMsg = ref("");

const activeJobId = ref<number | null>(null);
const jobStatus = ref<IcloudSyncJobStatus | null>(null);
const jobAppleId = ref("");
const currentAppleId = ref("");
const progress = ref<IcloudSyncProgressPayload>({ done: 0, total: 0, filename: "" });
const jobFailed = ref(0);
const jobPending = ref(0);
const assetTasks = ref<(IcloudSyncAssetTaskRow & { rowKey: string })[]>([]);
const taskTotal = ref(0);
const taskFilter = ref<IcloudSyncAssetTaskFilter>("all");
const taskPage = ref(1);
const taskPageSize = ref(50);
const loadingTasks = ref(false);
let taskRefreshTimer: ReturnType<typeof setTimeout> | undefined;

/** catalog 阶段起始时间戳（ms），用于展示已扫描时长 */
const catalogStartedAt = ref<number | null>(null);
const nowTick = ref(Date.now());
let catalogTimer: ReturnType<typeof setInterval> | undefined;

/** 任务创建账号与当前 settings 账号是否一致 */
const jobAccountMismatch = computed(() => {
  const jobId = jobAppleId.value.trim().toLowerCase();
  const current = currentAppleId.value.trim().toLowerCase();
  if (!jobId || !current) return false;
  return jobId !== current;
});

const maskedCurrentAppleId = computed(() => maskAppleId(currentAppleId.value));

const isCataloging = computed(() => jobStatus.value === "cataloging");
const isPausedSession = computed(() => jobStatus.value === "paused_session");
const isPausedUser = computed(() => jobStatus.value === "paused_user");
const isPaused = computed(() => isPausedSession.value || isPausedUser.value);
const canResume = computed(() => !jobAccountMismatch.value && (isPausedSession.value || isPausedUser.value) && !resuming.value);
const isRunning = computed(() => jobStatus.value === "running" || starting.value || resuming.value || isCataloging.value);
const canPause = computed(() => jobStatus.value === "running" && !pausing.value);
const isDone = computed(() => jobStatus.value === "done");
const isFailed = computed(() => jobStatus.value === "failed");

const progressPercent = computed(() => {
  if (!progress.value.total) return 0;
  return Math.min(100, Math.round((progress.value.done / progress.value.total) * 100));
});

const catalogElapsedText = computed(() => {
  if (!isCataloging.value || catalogStartedAt.value == null) return "—";
  const ms = nowTick.value - catalogStartedAt.value;
  const d = dayjs.duration(ms);
  const mins = Math.floor(d.asMinutes());
  const secs = d.seconds();
  if (mins > 0) return `${mins} 分 ${secs} 秒`;
  return `${secs} 秒`;
});

const jobStatusLabel = computed(() => {
  const map: Record<IcloudSyncJobStatus, string> = {
    cataloging: "扫描图库",
    pending: "待下载",
    running: "下载中",
    paused_session: "已暂停（登录失效）",
    paused_user: "已暂停",
    done: "已完成",
    failed: "已失败"
  };
  return jobStatus.value ? map[jobStatus.value] : "—";
});

/** 同步概览表格行（比进度条更易扫读多指标） */
const summaryRows = computed(() => {
  const rows: { label: string; value: string }[] = [{ label: "任务状态", value: jobStatusLabel.value }];
  if (isCataloging.value) {
    rows.push({ label: "扫描用时", value: catalogElapsedText.value });
  }
  if (progress.value.total > 0 || !isCataloging.value) {
    rows.push(
      { label: "总文件数", value: String(progress.value.total || "—") },
      { label: "已完成", value: String(progress.value.done) },
      { label: "待下载", value: String(jobPending.value) },
      { label: "失败", value: String(jobFailed.value) },
      { label: "完成率", value: progress.value.total ? `${progressPercent.value}%` : "—" }
    );
  }
  if (progress.value.filename && jobStatus.value === "running") {
    rows.push({ label: "当前文件", value: progress.value.filename });
  }
  return rows;
});

const taskTableColumns = [
  { title: "序号", dataIndex: "indexNum", width: 72 },
  { title: "部件", dataIndex: "part", width: 64 },
  { title: "原文件名", dataIndex: "originalFilename", ellipsis: true },
  { title: "状态", dataIndex: "status", width: 88 },
  { title: "尝试", dataIndex: "attemptCount", width: 56 },
  { title: "备注", dataIndex: "lastError", ellipsis: true }
];

function partLabel(part: string): string {
  if (part === "still") return "静态";
  if (part === "mov") return "视频";
  if (part === "full") return "整图";
  return part;
}

function statusLabel(status: string): string {
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "pending") return "待下载";
  return status;
}

function statusTagColor(status: string): string {
  if (status === "done") return "success";
  if (status === "failed") return "error";
  return "default";
}

function maskAppleId(raw: string): string {
  const id = raw.trim();
  if (!id) return "未登录";
  if (!id.includes("@")) return id;
  const [local, domain] = id.split("@");
  const head = local.length <= 2 ? (local[0] ?? "") : local.slice(0, 2);
  return `${head}***@${domain}`;
}

function syncCatalogTimer() {
  if (isCataloging.value) {
    if (catalogStartedAt.value == null) {
      catalogStartedAt.value = Date.now();
    }
    if (!catalogTimer) {
      catalogTimer = setInterval(() => {
        nowTick.value = Date.now();
      }, 1000);
    }
  } else {
    catalogStartedAt.value = null;
    if (catalogTimer) {
      clearInterval(catalogTimer);
      catalogTimer = undefined;
    }
  }
}

async function loadAccountContext() {
  if (!isTauri()) return;
  try {
    const [settings, authState] = await Promise.all([getIcloudSyncSettings(), getIcloudSyncAuthState()]);
    currentAppleId.value = settings.appleId?.trim() ?? "";
    isLoggedIn.value = authState.loggedIn;
  } catch {
    currentAppleId.value = "";
    isLoggedIn.value = false;
  }
}

async function refreshAssetTasks(jobId: number) {
  if (!isTauri() || progress.value.total <= 0) {
    assetTasks.value = [];
    taskTotal.value = 0;
    return;
  }
  loadingTasks.value = true;
  try {
    const offset = (taskPage.value - 1) * taskPageSize.value;
    const result = await listIcloudSyncAssetTasks(jobId, {
      offset,
      limit: taskPageSize.value,
      status: taskFilter.value
    });
    assetTasks.value = result.items.map((row, idx) => ({
      ...row,
      rowKey: `${row.indexNum}-${row.part}-${offset + idx}`
    }));
    taskTotal.value = result.total;
  } catch {
    assetTasks.value = [];
    taskTotal.value = 0;
  } finally {
    loadingTasks.value = false;
  }
}

function scheduleRefreshAssetTasks(jobId: number) {
  if (taskRefreshTimer) clearTimeout(taskRefreshTimer);
  taskRefreshTimer = setTimeout(() => void refreshAssetTasks(jobId), 800);
}

function onTaskFilterChange() {
  taskPage.value = 1;
  const jobId = activeJobId.value;
  if (jobId != null) void refreshAssetTasks(jobId);
}

function onTaskTableChange(pagination: { current?: number; pageSize?: number }) {
  taskPage.value = pagination.current ?? 1;
  if (pagination.pageSize) taskPageSize.value = pagination.pageSize;
  const jobId = activeJobId.value;
  if (jobId != null) void refreshAssetTasks(jobId);
}

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

function clearActiveJob() {
  storeJobId(null);
  jobStatus.value = null;
  jobAppleId.value = "";
  progress.value = { done: 0, total: 0, filename: "" };
  jobFailed.value = 0;
  jobPending.value = 0;
  assetTasks.value = [];
  taskTotal.value = 0;
  taskPage.value = 1;
  syncCatalogTimer();
}

/** 将 Rust 推送或 invoke 返回的状态同步到页内 UI */
function applyJobStatus(status: IcloudSyncJobStatusResult) {
  if (activeJobId.value != null && status.jobId !== activeJobId.value) return;
  jobAppleId.value = status.appleId ?? "";
  jobStatus.value = status.status;
  jobFailed.value = status.failed ?? 0;
  jobPending.value = status.pending ?? 0;
  progress.value = {
    done: status.done,
    total: status.total,
    filename: progress.value.filename
  };
  syncCatalogTimer();
  if (status.status === "done") {
    progress.value = { done: status.total, total: status.total, filename: "" };
    try {
      localStorage.removeItem(ICLOUD_SYNC_ACTIVE_JOB_KEY);
    } catch {
      /* 已完成任务不再持久化，避免下次启动误触发通知 */
    }
  }
  void refreshAssetTasks(status.jobId);
}

/** 拉取任务状态并同步进度 */
async function refreshJobStatus(jobId: number) {
  const status = await getIcloudSyncJobStatus(jobId);
  applyJobStatus(status);
  return status;
}

async function hydrateFromStorage() {
  await loadAccountContext();
  const jobId = readStoredJobId();
  if (jobId == null) return;
  activeJobId.value = jobId;
  try {
    const status = await refreshJobStatus(jobId);
    if (currentAppleId.value.trim() && status.appleId.trim().toLowerCase() !== currentAppleId.value.trim().toLowerCase()) {
      clearActiveJob();
    }
  } catch {
    storeJobId(null);
    jobStatus.value = null;
    jobAppleId.value = "";
  }
}

async function onStart() {
  starting.value = true;
  errorMsg.value = "";
  try {
    const result = await startIcloudSyncJob();
    storeJobId(result.jobId);
    jobStatus.value = "cataloging";
    catalogStartedAt.value = Date.now();
    syncCatalogTimer();
    progress.value = { done: 0, total: 0, filename: "" };
    jobFailed.value = 0;
    jobPending.value = 0;
    assetTasks.value = [];
    taskTotal.value = 0;
    taskPage.value = 1;
    void refreshJobStatus(result.jobId);
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

function onLoggedIn(payload: { accountChanged: boolean }) {
  void loadAccountContext();
  if (payload.accountChanged) {
    clearActiveJob();
    errorMsg.value = "";
  }
}

function onLoggedOut() {
  void loadAccountContext();
}

async function onLogout() {
  loggingOut.value = true;
  errorMsg.value = "";
  try {
    await logoutIcloudSync(true);
    await loadAccountContext();
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    loggingOut.value = false;
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
      const jobId = activeJobId.value;
      if (jobId != null) scheduleRefreshAssetTasks(jobId);
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
  if (catalogTimer) {
    clearInterval(catalogTimer);
  }
  if (taskRefreshTimer) {
    clearTimeout(taskRefreshTimer);
  }
});
</script>

<template>
  <div class="icloud-sync-page">
    <a-card class="sync-card card-rounded" :bordered="true">
      <template #title>
        <div class="card-head">
          <div>
            <span>同步 iCloud 照片</span>
            <span class="scope-hint">按拍摄时间顺序下载全部照片、视频与 Live Photo</span>
          </div>
          <div class="head-actions">
            <a-tag v-if="isLoggedIn" color="success">已登录 · {{ maskedCurrentAppleId }}</a-tag>
            <a-button v-if="isLoggedIn" type="link" danger size="small" :loading="loggingOut" @click="onLogout"> 退出登录 </a-button>
            <a-button v-else type="link" size="small" @click="openAuthModal">Apple ID 登录</a-button>
          </div>
        </div>
      </template>

      <a-alert
        v-if="jobAccountMismatch"
        type="error"
        show-icon
        class="mb-16px"
        message="任务与当前账号不一致"
        :description="`本地任务属于 ${maskAppleId(jobAppleId)}，当前登录 ${maskedCurrentAppleId}。请开始新同步，勿续传旧任务。`"
      />

      <a-alert
        v-else-if="isPausedSession"
        type="warning"
        show-icon
        class="mb-16px"
        message="同步已暂停（登录失效）"
        description="登录状态已失效，已完成文件的进度已保留。请先退出登录，再重新登录后继续同步。"
      />

      <a-alert v-if="isDone" type="success" show-icon class="mb-16px" message="同步已完成" />
      <a-alert v-if="isFailed" type="error" show-icon class="mb-16px" message="任务已失败，请检查错误信息后新建任务" />

      <a-alert
        v-if="isCataloging"
        type="info"
        show-icon
        class="mb-16px"
        message="正在扫描 iCloud 图库…"
        description="首次同步需枚举全部照片；扫描完成后自动开始下载，窗口可正常操作。"
      />

      <div class="mb-16px flex items-center justify-between">
        <div class="form-actions">
          <a-button type="primary" :loading="starting" :disabled="isRunning || isPaused" @click="onStart">开始同步</a-button>
          <a-button v-if="isPaused && activeJobId != null" type="primary" :loading="resuming" :disabled="!canResume" @click="onResume">
            继续同步
          </a-button>
          <a-button v-if="canPause" danger :loading="pausing" @click="onPause">暂停同步</a-button>
          <a-button @click="goSettings">同步设置</a-button>
        </div>
      </div>

      <section v-if="activeJobId != null && (progress.total > 0 || isCataloging || jobStatus)" class="section mb-16px">
        <a-descriptions bordered size="small">
          <template #title>
            <h4 class="section-title">同步概览</h4>
          </template>
          <a-descriptions-item v-for="item in summaryRows" :key="item.label" :label="item.label">{{ item.value }}</a-descriptions-item>
        </a-descriptions>
      </section>

      <section v-if="activeJobId != null && progress.total > 0" class="section">
        <div class="section-head">
          <h4 class="section-title">文件任务（共 {{ progress.total }} 个）</h4>
          <a-radio-group v-model:value="taskFilter" size="small" @change="onTaskFilterChange">
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="pending">待下载</a-radio-button>
            <a-radio-button value="done">已完成</a-radio-button>
            <a-radio-button value="failed">失败</a-radio-button>
          </a-radio-group>
        </div>
        <a-spin :spinning="loadingTasks">
          <a-table
            :columns="taskTableColumns"
            :data-source="assetTasks"
            size="small"
            bordered
            row-key="rowKey"
            :scroll="{ y: 320 }"
            :pagination="{
              current: taskPage,
              pageSize: taskPageSize,
              total: taskTotal,
              showSizeChanger: true,
              pageSizeOptions: ['50', '100', '200'],
              showTotal: (total: number) => `共 ${total} 条`
            }"
            @change="onTaskTableChange"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'indexNum'">
                {{ String(record.indexNum).padStart(5, "0") }}
              </template>
              <template v-else-if="column.dataIndex === 'part'">
                {{ partLabel(record.part) }}
              </template>
              <template v-else-if="column.dataIndex === 'status'">
                <a-tag :color="statusTagColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
              </template>
              <template v-else-if="column.dataIndex === 'lastError'">
                {{ record.lastError || "—" }}
              </template>
            </template>
          </a-table>
        </a-spin>
      </section>

      <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="mb-12px" />
    </a-card>

    <IcloudSyncAuthModal v-model:open="authModalOpen" @logged-in="onLoggedIn" @logged-out="onLoggedOut" />
  </div>
</template>

<style scoped lang="scss">
.sync-card {
  :deep(.ant-card-head) {
    min-height: auto;
    padding: 12px 16px;
  }
  :deep(.ant-card-body) {
    padding: 16px;
  }
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-size: 16px;
  font-weight: 600;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.summary-table {
  :deep(.ant-table-cell) {
    font-size: 13px;
  }
}
.scope-hint {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-tertiary);
}
.form-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
