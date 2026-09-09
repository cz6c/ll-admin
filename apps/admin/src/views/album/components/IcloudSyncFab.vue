<!--
  iCloud 同步浮动触发区
  职责：右下角 FAB；抽屉顶部全局进度 +「同步到本地」列表心智；工具栏危险区删云
  主流程：hydrate → FAB → StatusCard → 拉取筛选项列表；删云经确认后全屏浮层展示进度/成败
-->
<script setup lang="ts">
import IcloudSyncAuthPanel from "./IcloudSyncAuthPanel.vue";
import IcloudSyncStatusCard from "./IcloudSyncStatusCard.vue";
import IcloudSyncFabWave from "./IcloudSyncFabWave.vue";
import {
  formatIcloudSyncError,
  getIcloudSyncCloudStateSummary,
  loadIcloudSyncCloudList,
  deleteIcloudSyncAssets,
  deleteAllSyncedIcloudAssets,
  retryIcloudSyncCloudDeletes,
  type IcloudSyncCloudStateFilter,
  type IcloudSyncCloudStateSummary,
  type IcloudSyncDeleteAssetsResult
} from "@/api/icloudSync";
import {
  cloudListRowsToAssetItems,
  cloudListDisplayState,
  cloudListDisplayFilename,
  cloudFilterTabLabel,
  cloudStateLabel,
  cloudStateColor,
  cloudDeletedLocalPresenceLabel,
  cloudDeletedLocalPresenceColor,
  CLOUD_LIST_PULL_FILTER_OPTIONS,
  type CloudListStateFilterOption,
  type IcloudSyncCloudListRow
} from "@/utils/icloudSyncCloudList";
import $feedback from "@/utils/feedback";
import dayjs, { type Dayjs } from "dayjs";
import { useDebounceFn, useResizeObserver, useThrottleFn } from "@vueuse/core";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSyncFab" });

/** 删云全屏浮层阶段：入队后 running，任务终态切 done/failed；关闭回 idle */
type CloudDeleteOverlayPhase = "idle" | "running" | "done" | "failed";

type CloudListDisplayRow = IcloudSyncCloudListRow & {
  displayFilename: string;
  displayStateLabel: string;
  displayStateColor: string;
};

const {
  fabState,
  isLoggedIn,
  maskedCurrentAppleId,
  cloudStateTick,
  downloadProgressTick,
  canManageCloudSpace,
  refreshingCatalog,
  bindActiveTask,
  onRefreshCatalog,
  isCloudDeleteTask,
  jobStatus,
  progress,
  progressPercent,
  onLoggedIn,
  onLogoutAccount,
  hydrateFromStorage,
  refreshAccountSettings,
  clearActiveJob
} = useIcloudSyncJob();

const drawerOpen = ref(false);
const loggingOut = ref(false);

/** 抽屉打开且未登录：内嵌登录面板（替代原弹窗） */
const authPanelActive = computed(() => drawerOpen.value && !isLoggedIn.value);

/** 列表筛选项（仅「同步到本地」PULL 子集） */
const cloudFilter = ref<IcloudSyncCloudStateFilter>("cloud_only");
/** 按拍摄/加入时间区间筛选（YYYY-MM-DD） */
const cloudDateRange = ref<[Dayjs, Dayjs] | null>(null);
/** 文件名模糊搜索（对 original_filename） */
const cloudFilenameKeyword = ref("");
const cloudPage = ref(1);
const cloudPageSize = ref(50);
const cloudTotal = ref(0);
const cloudRows = ref<CloudListDisplayRow[]>([]);
const cloudSummary = ref<IcloudSyncCloudStateSummary | null>(null);
const loadingCloud = ref(false);
const deletingCloud = ref(false);
const deletingAllSynced = ref(false);
const retryingCloudDelete = ref(false);
const cloudSelectedKeys = ref<string[]>([]);
/** 跨页勾选的行快照；翻页后当前 dataSource 不含他页行，删云/取消须用此 Map */
const cloudSelectedRowsByKey = ref(new Map<string, CloudListDisplayRow>());

/** 删云进度浮层：无取消；失败可在浮层内重试 */
const cloudDeleteOverlayPhase = ref<CloudDeleteOverlayPhase>("idle");
const cloudDeleteOverlayVisible = computed(() => cloudDeleteOverlayPhase.value !== "idle");

/**
 * 合并当前页勾选与他页已选。
 * antd Table 的 onChange 默认只回传本页 keys，直接赋值会丢掉跨页勾选。
 */
function mergeCloudPageSelection(keys: (string | number)[], rows: CloudListDisplayRow[]) {
  const pageKeySet = new Set(cloudRows.value.map(row => row.rowKey));
  const reported = keys.map(String);
  const reportedOffPage = reported.some(key => !pageKeySet.has(key));
  const nextKeys = reportedOffPage
    ? reported
    : [...cloudSelectedKeys.value.filter(key => !pageKeySet.has(key)), ...reported.filter(key => pageKeySet.has(key))];
  const nextKeySet = new Set(nextKeys);
  const nextMap = new Map(cloudSelectedRowsByKey.value);
  for (const key of [...nextMap.keys()]) {
    if (!nextKeySet.has(key)) nextMap.delete(key);
  }
  for (const row of rows) {
    if (row?.rowKey && nextKeySet.has(row.rowKey)) nextMap.set(row.rowKey, row);
  }
  cloudSelectedKeys.value = nextKeys;
  cloudSelectedRowsByKey.value = nextMap;
}

function clearCloudSelection() {
  cloudSelectedKeys.value = [];
  cloudSelectedRowsByKey.value = new Map();
}

/** 用当前页最新行刷新已选快照（catalog 刷新后 cloudState 可能已变） */
function refreshSelectedRowsFromPage(rows: CloudListDisplayRow[]) {
  if (cloudSelectedRowsByKey.value.size === 0) return;
  const nextMap = new Map(cloudSelectedRowsByKey.value);
  for (const row of rows) {
    if (nextMap.has(row.rowKey)) nextMap.set(row.rowKey, row);
  }
  cloudSelectedRowsByKey.value = nextMap;
}

/** 跨页已勾选行（含他页快照）；缺快照的 key 忽略 */
function selectedCloudRows(): CloudListDisplayRow[] {
  return cloudSelectedKeys.value.map(key => cloudSelectedRowsByKey.value.get(key)).filter((row): row is CloudListDisplayRow => !!row);
}

/** 已登录且可腾空间时提供勾选；仅 synced 可选 */
const cloudRowSelection = computed(() =>
  canManageCloudSpace.value
    ? {
        selectedRowKeys: cloudSelectedKeys.value,
        onChange: (keys: (string | number)[], rows: CloudListDisplayRow[]) => {
          mergeCloudPageSelection(keys, rows);
        },
        getCheckboxProps: (record: { cloudState: string }) => ({
          disabled: record.cloudState !== "synced"
        })
      }
    : undefined
);

/** 未完成任务占用时，禁用云列表操作的提示（已暂停时不再引导「暂停」） */
const TASK_BUSY_HINT = "有任务进行中，请取消或等待结束后再操作";

function onRefreshCatalogClick() {
  if (!guardCloudManageAction()) return;
  void onRefreshCatalog();
}

/** 有任务进行中时禁止删云 / 刷新 catalog */
function guardCloudManageAction(): boolean {
  if (canManageCloudSpace.value) return true;
  $feedback.message.warning(TASK_BUSY_HINT);
  return false;
}

const cloudTableColumns = [
  { title: "序号", dataIndex: "listSeq", width: 80 },
  { title: "拍摄时间", dataIndex: "sortKey", width: 140 },
  { title: "原文件名", dataIndex: "originalFilename" },
  { title: "状态", dataIndex: "cloudState", width: 210 }
];

/**
 * 当前筛选结果下的跨页列表序号（便于对照「共 N 条」查漏）
 * @param rowIndexInPage 当前页内 0-based 行下标
 */
function cloudListSeq(rowIndexInPage: number): number {
  return (cloudPage.value - 1) * cloudPageSize.value + rowIndexInPage + 1;
}

/** Tab：PULL 子集；同步失败角标为 0 时隐藏该项 */
const cloudStateFilterTabs = computed((): CloudListStateFilterOption[] => {
  return CLOUD_LIST_PULL_FILTER_OPTIONS.filter(tab => tab.value !== "download_failed" || (cloudSummary.value?.downloadFailed ?? 0) > 0);
});

/** 校正非法 / 已消失的角标筛选项 */
function ensureCloudFilter() {
  const allowed = new Set(CLOUD_LIST_PULL_FILTER_OPTIONS.map(t => t.value));
  const prev = cloudFilter.value;
  if (!allowed.has(cloudFilter.value)) {
    cloudFilter.value = "cloud_only";
  } else if (cloudFilter.value === "download_failed" && !(cloudSummary.value?.downloadFailed ?? 0)) {
    cloudFilter.value = "cloud_only";
  }
  if (cloudFilter.value !== prev) cloudPage.value = 1;
}

/** Tab 角标数字；0 返回 null */
function summaryTabCountNum(key?: keyof IcloudSyncCloudStateSummary): number | null {
  if (!key || !cloudSummary.value) return null;
  const count = cloudSummary.value[key] as number | undefined;
  if (!count || count <= 0) return null;
  return count;
}

const deleteBusy = computed(() => deletingCloud.value || deletingAllSynced.value || retryingCloudDelete.value);

/** 有勾选 → 移除所选；否则 → 移除全部已同步 */
const deleteCloudPrimaryLabel = computed(() => (cloudSelectedKeys.value.length > 0 ? `移除所选（${cloudSelectedKeys.value.length}）` : "移除全部已同步"));

const deleteCloudPrimaryDisabled = computed(() => {
  if (!canManageCloudSpace.value || deleteBusy.value) return true;
  if (cloudSelectedKeys.value.length > 0) return false;
  return !cloudSummary.value?.synced;
});

const cloudTableWrapRef = ref<HTMLElement | null>(null);
const tableScrollY = ref(320);

useResizeObserver(cloudTableWrapRef, ([entry]) => {
  tableScrollY.value = Math.max(160, Math.floor(entry.contentRect.height - 88));
});

function onDeleteCloudPrimaryClick() {
  if (!guardCloudManageAction()) return;
  if (cloudSelectedKeys.value.length > 0) confirmDeleteCloud();
  else confirmDeleteAllSynced();
}

/**
 * 展示 catalog 时间键（Library=拍摄时间；Recents=加入时间）
 * @param sortKey ISO8601 或可被 dayjs 解析的字符串
 */
function formatSortKeyTime(sortKey: string | undefined | null): string {
  const raw = (sortKey ?? "").trim();
  if (!raw) return "—";
  const d = dayjs(raw);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : raw;
}

/** 当前时间区间筛选参数（传给 load_assets） */
function cloudDateBounds(): { dateFrom?: string; dateTo?: string } {
  if (!cloudDateRange.value) return {};
  const [from, to] = cloudDateRange.value;
  return {
    dateFrom: from?.format("YYYY-MM-DD"),
    dateTo: to?.format("YYYY-MM-DD")
  };
}

async function refreshCloudAssets() {
  if (!isLoggedIn.value) return;
  loadingCloud.value = true;
  try {
    const summary = await getIcloudSyncCloudStateSummary();
    cloudSummary.value = summary;
    ensureCloudFilter();
    const list = await loadIcloudSyncCloudList({
      offset: (cloudPage.value - 1) * cloudPageSize.value,
      limit: cloudPageSize.value,
      cloudState: cloudFilter.value,
      ...cloudDateBounds(),
      filenameKeyword: cloudFilenameKeyword.value.trim() || undefined
    });
    cloudRows.value = list.items.map(row => {
      const displayRow: IcloudSyncCloudListRow = { ...row, rowKey: row.assetId };
      const state = cloudListDisplayState(displayRow);
      return {
        ...displayRow,
        displayFilename: cloudListDisplayFilename(displayRow),
        displayStateLabel: cloudStateLabel(state),
        displayStateColor: cloudStateColor(state)
      };
    });
    cloudTotal.value = list.total;
    refreshSelectedRowsFromPage(cloudRows.value);
  } catch (e) {
    // 列表加载失败用轻提示，避免底栏粘住历史错误
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    loadingCloud.value = false;
  }
}

function onCloudFilterChange() {
  cloudPage.value = 1;
  clearCloudSelection();
  void refreshCloudAssets();
}

/** 文件名输入防抖刷新（与 Tab/日期筛选共用重置页码） */
const onCloudFilenameKeywordChange = useDebounceFn(() => {
  onCloudFilterChange();
}, 300);

function onCloudTableChange(pagination: { current?: number; pageSize?: number }) {
  if (pagination.current) cloudPage.value = pagination.current;
  if (pagination.pageSize) cloudPageSize.value = pagination.pageSize;
  void refreshCloudAssets();
}

/** 抽屉打开且已登录时刷新列表 */
function refreshCloudIfVisible() {
  if (!drawerOpen.value || !isLoggedIn.value) return;
  void refreshCloudAssets();
}

/** iCloud 移除说明：本地保留 + 最近删除（Modal 与提示共用） */
const ICLOUD_REMOVE_HINT =
  "只删除 iCloud 上的副本，电脑里的文件会保留。照片会先进入 iCloud「最近删除」，通常约 30 天后才彻底释放空间；此期间可在 iPhone 或 iCloud.com 恢复。";

/**
 * 格式化「从 iCloud 移除」入队结果（区分缺 CPL / 本地缺失，文案可行动）
 */
function formatDeleteEnqueueMessage(result: IcloudSyncDeleteAssetsResult): string {
  const parts = [`已安排从 iCloud 移除 ${result.accepted} 项`];
  if (result.rejectedLocalMissing > 0) {
    parts.push(`${result.rejectedLocalMissing} 项本地文件缺失已跳过（可先「刷新状态」核对）`);
  }
  if (result.rejectedMissingCpl > 0) {
    parts.push(`${result.rejectedMissingCpl} 项缺云端元数据（请先「同步到本地」或「刷新状态」）`);
  }
  const other = result.rejected - (result.rejectedLocalMissing ?? 0) - (result.rejectedMissingCpl ?? 0);
  if (other > 0) {
    parts.push(`${other} 项无法入队`);
  }
  return parts.join("，");
}

/** 入队结果：有跳过项用 warning，全部成功用 success */
function notifyDeleteEnqueueResult(result: IcloudSyncDeleteAssetsResult) {
  const text = formatDeleteEnqueueMessage(result);
  if (result.rejected > 0) $feedback.message.warning(text);
  else $feedback.message.success(text);
}

/**
 * 删云相关操作失败：轻提示，不写抽屉底栏（避免与进行中任务矛盾粘住）
 * @note 「没有可删除…」属可纠正条件，用 warning
 */
function notifyDeleteOpError(e: unknown) {
  const text = formatIcloudSyncError(e);
  if (text.includes("没有可删除")) $feedback.message.warning(text);
  else $feedback.message.error(text);
}

/** 打开删云浮层并绑定任务（入队 / 重试成功后） */
async function beginCloudDeleteOverlay(jobId: number) {
  if (jobId <= 0) return;
  cloudDeleteOverlayPhase.value = "running";
  await bindActiveTask(jobId);
}

/** 关闭浮层：刷新列表并清空勾选；终态删云任务卸掉，进度卡回到同步空闲 */
function closeCloudDeleteOverlay() {
  cloudDeleteOverlayPhase.value = "idle";
  if (isCloudDeleteTask.value && (jobStatus.value === "done" || jobStatus.value === "failed")) {
    clearActiveJob();
  }
  clearCloudSelection();
  void refreshCloudAssets();
}

const cloudDeleteOverlayTitle = computed(() => {
  switch (cloudDeleteOverlayPhase.value) {
    case "running":
      return "正在从 iCloud 移除…";
    case "done":
      return "从 iCloud 移除已完成";
    case "failed":
      return "从 iCloud 移除失败";
    default:
      return "";
  }
});

const cloudDeleteOverlayStats = computed(() => {
  const p = progress.value;
  if (p.total <= 0) return "";
  return `共 ${p.total} · 已移除 ${p.done} · 待处理 ${p.pending} · 失败 ${p.failed}`;
});

const cloudDeleteOverlayDetail = computed(() => {
  const p = progress.value;
  if (cloudDeleteOverlayPhase.value === "running" && p.filename) {
    return `当前：${p.filename}`;
  }
  if (cloudDeleteOverlayPhase.value === "done") {
    if (p.failed > 0) return `成功 ${p.done} 项，失败 ${p.failed} 项。本地文件均保留。`;
    return `已成功移除 ${p.done || p.total} 项 iCloud 副本，本地文件保留。`;
  }
  if (cloudDeleteOverlayPhase.value === "failed") {
    const failPart = p.failed > 0 ? `失败 ${p.failed} 项` : "任务失败";
    const donePart = p.done > 0 ? `，已移除 ${p.done} 项` : "";
    return `${failPart}${donePart}。可关闭或重试失败项。`;
  }
  return "";
});

/** 删云确认：1.5s 冷却后才可点确认（设计 §安全） */
async function openDeleteConfirmModal(opts: { title: string; content: string; onConfirm: () => Promise<void> }) {
  try {
    await $feedback.confirm(opts.content, {
      title: opts.title,
      okText: "确认从 iCloud 移除",
      cooldownMs: 1500
    });
  } catch {
    return;
  }
  try {
    await opts.onConfirm();
  } catch {
    /* onConfirm 内已 toast；此处吞掉避免未处理 rejection */
  }
}

/** 从 iCloud 移除确认 Modal：1.5s 冷却后才可点确认（设计 §安全） */
function confirmDeleteCloud() {
  if (!guardCloudManageAction()) return;
  const selected = selectedCloudRows().filter(row => row.cloudState === "synced");
  if (selected.length === 0) {
    $feedback.message.warning("请先勾选要从 iCloud 移除的照片（须已同步到本地）");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除所选 ${selected.length} 项？`,
    content: ICLOUD_REMOVE_HINT,
    onConfirm: async () => {
      deletingCloud.value = true;
      try {
        const result = await deleteIcloudSyncAssets(cloudListRowsToAssetItems(selected));
        notifyDeleteEnqueueResult(result);
        clearCloudSelection();
        await beginCloudDeleteOverlay(result.jobId);
      } catch (e) {
        notifyDeleteOpError(e);
        throw e;
      } finally {
        deletingCloud.value = false;
      }
    }
  });
}

/** 全部已同步项从 iCloud 移除（跨页） */
function confirmDeleteAllSynced() {
  if (!guardCloudManageAction()) return;
  const syncedCount = cloudSummary.value?.synced ?? 0;
  if (syncedCount <= 0) {
    $feedback.message.info("没有已同步到本地、可从 iCloud 移除的项");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除全部已同步项（约 ${syncedCount} 项）？`,
    content: `${ICLOUD_REMOVE_HINT} 本地文件缺失的项会自动跳过。`,
    onConfirm: async () => {
      deletingAllSynced.value = true;
      try {
        const result = await deleteAllSyncedIcloudAssets();
        notifyDeleteEnqueueResult(result);
        clearCloudSelection();
        await beginCloudDeleteOverlay(result.jobId);
      } catch (e) {
        notifyDeleteOpError(e);
        throw e;
      } finally {
        deletingAllSynced.value = false;
      }
    }
  });
}

/** 浮层内重试失败项（方案 A） */
async function onRetryCloudDeletesFromOverlay() {
  if (retryingCloudDelete.value) return;
  retryingCloudDelete.value = true;
  try {
    const result = await retryIcloudSyncCloudDeletes();
    if (result.retried === 0) {
      $feedback.message.info("没有需要从 iCloud 移除的失败项");
      return;
    }
    $feedback.message.success(`已重新安排 ${result.retried} 项从 iCloud 移除`);
    await beginCloudDeleteOverlay(result.jobId);
  } catch (e) {
    notifyDeleteOpError(e);
  } finally {
    retryingCloudDelete.value = false;
  }
}

/** 删云任务终态驱动浮层 phase（仅浮层已打开且为 cloudDelete 时） */
watch(
  () => ({
    visible: cloudDeleteOverlayVisible.value,
    isDelete: isCloudDeleteTask.value,
    status: jobStatus.value
  }),
  ({ visible, isDelete, status }) => {
    if (!visible || !isDelete || !status) return;
    if (status === "done") cloudDeleteOverlayPhase.value = "done";
    else if (status === "failed") cloudDeleteOverlayPhase.value = "failed";
    else if (status === "running" || status === "pending" || status === "paused_user" || status === "paused_session") {
      cloudDeleteOverlayPhase.value = "running";
    }
  }
);

watch(canManageCloudSpace, ok => {
  if (!ok) clearCloudSelection();
});

watch(drawerOpen, open => {
  if (open) {
    // A′：开抽屉只刷 settings 展示，不 auth_probe
    void refreshAccountSettings();
    refreshCloudIfVisible();
  }
});

watch(isLoggedIn, refreshCloudIfVisible);

watch(cloudStateTick, refreshCloudIfVisible);

/** 下载中 progress 事件驱动列表 refresh（cloud_state 仅在 catalog/完成时变） */
const throttledRefreshOnDownload = useThrottleFn(refreshCloudIfVisible, 1200, true, true);
watch(downloadProgressTick, throttledRefreshOnDownload);

const iconName = computed(() => {
  switch (fabState.value.icon) {
    case "check":
      return "mdi:check-circle";
    case "warning":
      return "mdi:alert-circle";
    case "pause":
      return "mdi:pause-circle";
    default:
      return "mdi:cloud-outline";
  }
});

/** 下载中显示进度环，其余状态显示图标 */
const showProgress = computed(() => fabState.value.percent > 0 && fabState.value.percent < 100);

async function onLogout() {
  loggingOut.value = true;
  try {
    await onLogoutAccount();
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    loggingOut.value = false;
  }
}

onMounted(() => {
  if (isTauri()) void hydrateFromStorage();
});
</script>

<template>
  <div class="fab-root">
    <a-button class="fab-btn" :class="`fab-${fabState.color}`" shape="circle" size="large" :title="fabState.label" @click="drawerOpen = true">
      <IcloudSyncFabWave v-if="showProgress" :percent="fabState.percent" :tone="fabState.color" :size="46" />
      <IconifyIcon v-else :icon="iconName" :class="{ breathing: fabState.breathing }" width="28" height="28" />
    </a-button>
  </div>

  <a-drawer
    v-model:open="drawerOpen"
    title="iCloud 同步"
    placement="right"
    :width="920"
    class="icloud-sync-drawer"
    :body-style="{ padding: '16px 20px', height: '100%', overflow: 'hidden' }"
  >
    <template #extra>
      <a-space v-if="isLoggedIn" :size="4" align="center">
        <div class="drawer-extra-tag">{{ maskedCurrentAppleId }}</div>
        <a-button type="link" size="small" danger :loading="loggingOut" @click="onLogout">退出</a-button>
      </a-space>
    </template>

    <div class="drawer-body">
      <IcloudSyncAuthPanel v-if="!isLoggedIn" :active="authPanelActive" @logged-in="onLoggedIn" />

      <template v-else>
        <div class="upper-panel">
          <IcloudSyncStatusCard />
        </div>

        <div class="cloud-toolbar">
          <a-tabs v-model:activeKey="cloudFilter" size="small" class="filter-tabs" @change="onCloudFilterChange">
            <a-tab-pane v-for="tab in cloudStateFilterTabs" :key="tab.value">
              <template #tab>
                <span class="filter-tab-label">
                  {{ cloudFilterTabLabel(tab) }}
                  <a-badge
                    v-if="summaryTabCountNum(tab.countKey)"
                    :count="summaryTabCountNum(tab.countKey)!"
                    :overflow-count="9999"
                    :number-style="tab.dangerCount ? { backgroundColor: '#ff4d4f' } : undefined"
                    :class="['tab-count-badge', tab.dangerCount ? 'tab-count-badge--danger' : undefined]"
                  />
                </span>
              </template>
            </a-tab-pane>
          </a-tabs>

          <div class="toolbar-actions">
            <div class="toolbar-left">
              <a-input
                v-model:value="cloudFilenameKeyword"
                class="cloud-filename-search"
                allow-clear
                placeholder="原文件名"
                spellcheck="false"
                @change="onCloudFilenameKeywordChange"
              />
              <a-range-picker
                v-model:value="cloudDateRange"
                class="cloud-date-range"
                :placeholder="['拍摄时间起始', '拍摄时间结束']"
                allow-clear
                @change="onCloudFilterChange"
              />
            </div>
            <div class="toolbar-right">
              <a-tooltip v-bind="canManageCloudSpace ? {} : { title: TASK_BUSY_HINT }">
                <a-button :loading="refreshingCatalog" :disabled="!canManageCloudSpace" @click="onRefreshCatalogClick()"> 刷新状态 </a-button>
              </a-tooltip>
              <a-tooltip v-bind="canManageCloudSpace ? {} : { title: TASK_BUSY_HINT }">
                <a-button type="primary" danger :loading="deleteBusy" :disabled="deleteCloudPrimaryDisabled" @click="onDeleteCloudPrimaryClick()">
                  {{ deleteCloudPrimaryLabel }}
                </a-button>
              </a-tooltip>
            </div>
          </div>
        </div>

        <div ref="cloudTableWrapRef" class="cloud-table-wrap">
          <a-spin :spinning="loadingCloud" class="cloud-table-spin">
            <a-table
              :columns="cloudTableColumns"
              :data-source="cloudRows"
              :row-selection="cloudRowSelection"
              size="small"
              bordered
              row-key="rowKey"
              :scroll="{ y: tableScrollY }"
              :pagination="{
                current: cloudPage,
                pageSize: cloudPageSize,
                total: cloudTotal,
                size: 'small',
                showSizeChanger: true,
                pageSizeOptions: ['30', '50', '100'],
                showTotal: (total: number) => (cloudSelectedKeys.length ? `共 ${total} 条，已选 ${cloudSelectedKeys.length} 项` : `共 ${total} 条`)
              }"
              @change="onCloudTableChange"
            >
              <template #bodyCell="{ column, record, index }">
                <template v-if="column.dataIndex === 'listSeq'">
                  {{ cloudListSeq(index) }}
                </template>
                <template v-else-if="column.dataIndex === 'sortKey'">
                  {{ formatSortKeyTime((record as CloudListDisplayRow).captureAt ?? (record as CloudListDisplayRow).sortKey) }}
                </template>
                <template v-else-if="column.dataIndex === 'cloudState'">
                  <a-tag :color="(record as CloudListDisplayRow).displayStateColor">
                    {{ (record as CloudListDisplayRow).displayStateLabel }}
                  </a-tag>
                  <a-tag
                    v-if="(record as CloudListDisplayRow).cloudState === 'deleted_cloud_pending'"
                    :color="cloudDeletedLocalPresenceColor(Boolean((record as CloudListDisplayRow).localFilePresent))"
                  >
                    {{ cloudDeletedLocalPresenceLabel(Boolean((record as CloudListDisplayRow).localFilePresent)) }}
                  </a-tag>
                </template>
                <template v-else-if="column.dataIndex === 'originalFilename'">
                  <span class="filename-text" :title="(record as CloudListDisplayRow).displayFilename">
                    {{ (record as CloudListDisplayRow).displayFilename }}
                  </span>
                </template>
              </template>
            </a-table>
          </a-spin>
        </div>
      </template>
    </div>
  </a-drawer>

  <!-- 删云全屏浮层：进度 / 完成 / 失败摘要；无取消；失败可重试 -->
  <Teleport to="body">
    <div v-if="cloudDeleteOverlayVisible" class="icloud-cloud-delete-overlay" role="dialog" aria-modal="true" :aria-label="cloudDeleteOverlayTitle">
      <div class="icloud-cloud-delete-overlay__panel">
        <h3 class="icloud-cloud-delete-overlay__title">{{ cloudDeleteOverlayTitle }}</h3>
        <a-progress
          v-if="cloudDeleteOverlayPhase === 'running' || progress.total > 0"
          class="icloud-cloud-delete-overlay__bar"
          :percent="cloudDeleteOverlayPhase === 'done' ? 100 : progressPercent"
          :status="cloudDeleteOverlayPhase === 'failed' ? 'exception' : cloudDeleteOverlayPhase === 'done' ? 'success' : 'active'"
          :show-info="true"
        />
        <p v-if="cloudDeleteOverlayStats" class="icloud-cloud-delete-overlay__stats">{{ cloudDeleteOverlayStats }}</p>
        <p v-if="cloudDeleteOverlayDetail" class="icloud-cloud-delete-overlay__detail">{{ cloudDeleteOverlayDetail }}</p>
        <div v-if="cloudDeleteOverlayPhase === 'done' || cloudDeleteOverlayPhase === 'failed'" class="icloud-cloud-delete-overlay__actions">
          <a-button @click="closeCloudDeleteOverlay()">关闭</a-button>
          <a-button v-if="cloudDeleteOverlayPhase === 'failed'" type="primary" :loading="retryingCloudDelete" @click="onRetryCloudDeletesFromOverlay()">
            重试失败项
          </a-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.fab-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
}
.fab-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  background: var(--color-bg-container, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
  &:hover,
  &:active {
    transform: scale(1.08);
    background: var(--color-bg-container, #fff);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}
.fab-default {
  color: var(--color-text-tertiary);
}
.fab-processing {
  color: var(--color-primary);
}
.fab-success {
  color: #52c41e;
}
.fab-warning {
  color: #faad14;
}
.fab-error {
  color: #ff4d4f;
}
.breathing {
  animation: fab-breathe 2.2s ease-in-out infinite;
}
@keyframes fab-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.9);
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .breathing {
    animation: none;
    opacity: 0.7;
  }
}

.drawer-extra-tag {
  margin: 0;
}
.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 14px;
}
.upper-panel {
  flex-shrink: 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--color-fill-quaternary, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--color-border-secondary, rgba(0, 0, 0, 0.06));
}
.cloud-toolbar {
  flex-shrink: 0;
}
.filter-tabs {
  :deep(.ant-tabs-nav) {
    margin-bottom: 0;
  }
  :deep(.ant-tabs-content) {
    display: none;
  }
}
.filter-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cloud-filename-search {
  width: 180px;
}
.cloud-date-range {
  width: 260px;
}
.tab-count-badge {
  :deep(.ant-badge-count) {
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    padding: 0 5px;
    font-size: 11px;
    box-shadow: none;
  }
}
:deep(.ant-tabs-tab-active) .tab-count-badge:not(.tab-count-badge--danger) .ant-badge-count {
  background: var(--color-primary);
}
.cloud-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;

  :deep(.ant-table-tbody > tr > td) {
    vertical-align: top;
  }
}
.cloud-table-spin {
  height: 100%;
  :deep(.ant-spin-container) {
    height: 100%;
  }
}
.filename-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
</style>

<style lang="scss">
/* 抽屉 body 撑满视口，表格区 flex 滚动 */
.icloud-sync-drawer.ant-drawer .ant-drawer-body {
  display: flex;
  flex-direction: column;
}

/*
 * 删云全屏浮层：高于抽屉；CS 壳下避让顶栏（与 antd.scss 全屏遮罩同理）
 * Teleport body，故不用 scoped
 */
.icloud-cloud-delete-overlay {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  top: var(--cs-shell-bar-height, 0px);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.icloud-cloud-delete-overlay__panel {
  width: min(440px, 100%);
  padding: 24px;
  border-radius: 8px;
  background: var(--color-bg-container, #fff);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icloud-cloud-delete-overlay__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.icloud-cloud-delete-overlay__bar {
  margin: 0;
}

.icloud-cloud-delete-overlay__stats,
.icloud-cloud-delete-overlay__detail {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.icloud-cloud-delete-overlay__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

@media (prefers-reduced-transparency: reduce) {
  .icloud-cloud-delete-overlay {
    backdrop-filter: none;
  }
}
</style>
