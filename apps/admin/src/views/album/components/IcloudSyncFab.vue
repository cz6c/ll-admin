<!--
  iCloud 同步浮动触发区
  职责：右下角 FAB；抽屉顶部全局进度，其下「拉取 / 释放」分栏共用列表
  主流程：hydrate → FAB → StatusCard（全局）→ 分栏列表（拉取只读 / 释放可删）
-->
<script setup lang="ts">
import IcloudSyncAuthModal from "./IcloudSyncAuthModal.vue";
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
  CLOUD_LIST_PULL_FILTER_OPTIONS,
  CLOUD_LIST_FREE_FILTER_OPTIONS,
  type CloudListStateFilterOption,
  type IcloudSyncCloudListRow
} from "@/utils/icloudSyncCloudList";
import { Modal, message } from "ant-design-vue";
import dayjs, { type Dayjs } from "dayjs";
import { useResizeObserver, useThrottleFn } from "@vueuse/core";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSyncFab" });

/** 抽屉场景：拉取与腾空间互斥展示 */
type DrawerMode = "pull" | "free";

type CloudListDisplayRow = IcloudSyncCloudListRow & {
  displayFilename: string;
  displayStateLabel: string;
  displayStateColor: string;
};

const {
  fabState,
  isLoggedIn,
  maskedCurrentAppleId,
  authModalOpen,
  errorMsg,
  cloudStateTick,
  downloadProgressTick,
  canManageCloudSpace,
  refreshingCatalog,
  starting,
  bindActiveTask,
  onRefreshCatalog,
  isCloudDeleteTask,
  isSyncTask,
  hasIncompleteTask,
  jobStatus,
  onLoggedIn,
  onLoggedOut,
  onLogoutAccount,
  hydrateFromStorage
} = useIcloudSyncJob();

const drawerOpen = ref(false);
const drawerMode = ref<DrawerMode>("pull");
const loggingOut = ref(false);

const DRAWER_MODE_OPTIONS = [
  { label: "同步到本地", value: "pull" },
  { label: "释放iCloud空间", value: "free" }
];

/** 释放空间默认看「待移除（已同步）」；拉取栏默认「待同步」 */
const cloudFilter = ref<IcloudSyncCloudStateFilter>("cloud_only");
/** 按拍摄/加入时间区间筛选（YYYY-MM-DD） */
const cloudDateRange = ref<[Dayjs, Dayjs] | null>(null);
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

const cloudRowSelection = computed(() =>
  drawerMode.value === "free" && canManageCloudSpace.value
    ? {
        selectedRowKeys: cloudSelectedKeys.value,
        onChange: (keys: (string | number)[], rows: CloudListDisplayRow[]) => {
          mergeCloudPageSelection(keys, rows);
        },
        getCheckboxProps: (record: { cloudState: string }) => ({
          // 排队中 / 已移除 / 待同步 不可再选删；取消排队走进度区「取消任务」
          disabled: record.cloudState === "deleted_cloud_pending" || record.cloudState === "cloud_only" || record.cloudState === "cloud_delete_queued"
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
  message.warning(TASK_BUSY_HINT);
  return false;
}

const cloudTableColumns = [
  { title: "序号", dataIndex: "listSeq", width: 80 },
  { title: "文件序号", dataIndex: "indexNum", width: 100 },
  { title: "拍摄时间", dataIndex: "sortKey", width: 140 },
  { title: "文件名", dataIndex: "originalFilename" },
  { title: "状态", dataIndex: "cloudState", width: 150 }
];

/**
 * 当前筛选结果下的跨页列表序号（便于对照「共 N 条」查漏）
 * @param rowIndexInPage 当前页内 0-based 行下标
 */
function cloudListSeq(rowIndexInPage: number): number {
  return (cloudPage.value - 1) * cloudPageSize.value + rowIndexInPage + 1;
}

/**
 * 按分栏返回 Tab：拉取 / 释放子集不同（严格四态，不含「移除中」）
 */
const cloudStateFilterTabs = computed((): CloudListStateFilterOption[] => {
  if (drawerMode.value === "pull") {
    return CLOUD_LIST_PULL_FILTER_OPTIONS.filter(tab => tab.value !== "download_failed" || (cloudSummary.value?.downloadFailed ?? 0) > 0);
  }
  return CLOUD_LIST_FREE_FILTER_OPTIONS;
});

/** 当前分栏允许的 filter 集合 */
function allowedFiltersForMode(mode: DrawerMode): Set<IcloudSyncCloudStateFilter> {
  const tabs = mode === "pull" ? CLOUD_LIST_PULL_FILTER_OPTIONS : CLOUD_LIST_FREE_FILTER_OPTIONS;
  return new Set(tabs.map(t => t.value));
}

/** 分栏默认筛选项 */
function defaultFilterForMode(mode: DrawerMode): IcloudSyncCloudStateFilter {
  return mode === "pull" ? "cloud_only" : "synced";
}

/** 切换分栏或 summary 变化后，校正非法 / 已消失的 filter */
function ensureFilterForMode(mode: DrawerMode = drawerMode.value) {
  const prev = cloudFilter.value;
  const allowed = allowedFiltersForMode(mode);
  if (!allowed.has(cloudFilter.value)) {
    cloudFilter.value = defaultFilterForMode(mode);
  } else if (cloudFilter.value === "download_failed" && !(cloudSummary.value?.downloadFailed ?? 0)) {
    cloudFilter.value = defaultFilterForMode(mode);
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
const freeSpacePrimaryLabel = computed(() => (cloudSelectedKeys.value.length > 0 ? `移除所选（${cloudSelectedKeys.value.length}）` : "移除全部已同步"));

const freeSpacePrimaryDisabled = computed(() => {
  if (!canManageCloudSpace.value || deleteBusy.value) return true;
  if (cloudSelectedKeys.value.length > 0) return false;
  return !cloudSummary.value?.synced;
});

const cloudTableWrapRef = ref<HTMLElement | null>(null);
const tableScrollY = ref(320);

useResizeObserver(cloudTableWrapRef, ([entry]) => {
  tableScrollY.value = Math.max(160, Math.floor(entry.contentRect.height - 88));
});

function onFreeSpacePrimaryClick() {
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

/** 拉取栏只需要 summary，避免空跑整表 — 两侧均有列表后统一走 refreshCloudAssets */
async function refreshCloudAssets() {
  if (!isLoggedIn.value) return;
  loadingCloud.value = true;
  try {
    const summary = await getIcloudSyncCloudStateSummary();
    cloudSummary.value = summary;
    ensureFilterForMode();
    let filter = cloudFilter.value;
    const list = await loadIcloudSyncCloudList({
      offset: (cloudPage.value - 1) * cloudPageSize.value,
      limit: cloudPageSize.value,
      cloudState: filter,
      ...cloudDateBounds()
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
    message.error(formatIcloudSyncError(e));
  } finally {
    loadingCloud.value = false;
  }
}

function onCloudFilterChange() {
  cloudPage.value = 1;
  clearCloudSelection();
  void refreshCloudAssets();
}

function onCloudTableChange(pagination: { current?: number; pageSize?: number }) {
  if (pagination.current) cloudPage.value = pagination.current;
  if (pagination.pageSize) cloudPageSize.value = pagination.pageSize;
  void refreshCloudAssets();
}

/** 抽屉打开且已登录时刷新列表（两分栏均有表） */
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
    parts.push(`${result.rejectedLocalMissing} 项本地文件缺失已跳过（可先在「释放iCloud空间」刷新状态核对）`);
  }
  if (result.rejectedMissingCpl > 0) {
    parts.push(`${result.rejectedMissingCpl} 项缺云端元数据（请先「同步到本地」或在「释放iCloud空间」刷新状态）`);
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
  if (result.rejected > 0) message.warning(text);
  else message.success(text);
}

/**
 * 删云相关操作失败：轻提示，不写抽屉底栏（避免与进行中任务矛盾粘住）
 * @note 「没有可删除…」属可纠正条件，用 warning
 */
function notifyDeleteOpError(e: unknown) {
  const text = formatIcloudSyncError(e);
  if (text.includes("没有可删除")) message.warning(text);
  else message.error(text);
}

/** Modal 共用：1.5s 冷却 + 最近删除说明 */
function openDeleteConfirmModal(opts: { title: string; content: string; onConfirm: () => Promise<void> }) {
  let remainMs = 1500;
  const modal = Modal.confirm({
    title: opts.title,
    content: opts.content,
    okText: "确认移除 (2s)",
    okType: "danger",
    okButtonProps: { disabled: true },
    cancelText: "取消",
    onOk: () => opts.onConfirm()
  });

  const timer = window.setInterval(() => {
    remainMs -= 200;
    if (remainMs <= 0) {
      window.clearInterval(timer);
      modal.update({ okText: "确认从 iCloud 移除", okButtonProps: { disabled: false } });
      return;
    }
    modal.update({ okText: `确认移除 (${Math.ceil(remainMs / 1000)}s)` });
  }, 200);
}

/** 从 iCloud 移除确认 Modal：1.5s 冷却后才可点确认（设计 §安全） */
function confirmDeleteCloud() {
  if (!guardCloudManageAction()) return;
  const selected = selectedCloudRows().filter(row => row.cloudState !== "cloud_delete_queued" && row.cloudState !== "deleted_cloud_pending");
  if (selected.length === 0) {
    message.warning("请先勾选要从 iCloud 移除的照片（须已同步到本地）");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除所选 ${selected.length} 项？`,
    content: ICLOUD_REMOVE_HINT,
    onConfirm: async () => {
      deletingCloud.value = true;
      errorMsg.value = "";
      try {
        const result = await deleteIcloudSyncAssets(cloudListRowsToAssetItems(selected));
        notifyDeleteEnqueueResult(result);
        clearCloudSelection();
        // 排队态无独立 Tab；任务进度看上方状态卡，「全部」可见 Tag
        cloudFilter.value = "all";
        cloudPage.value = 1;
        await refreshCloudAssets();
        if (result.jobId > 0) await bindActiveTask(result.jobId);
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
    message.info("没有已同步到本地、可从 iCloud 移除的项");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除全部已同步项（约 ${syncedCount} 项）？`,
    content: `${ICLOUD_REMOVE_HINT} 本地文件缺失的项会自动跳过。`,
    onConfirm: async () => {
      deletingAllSynced.value = true;
      errorMsg.value = "";
      try {
        const result = await deleteAllSyncedIcloudAssets();
        notifyDeleteEnqueueResult(result);
        clearCloudSelection();
        cloudFilter.value = "all";
        cloudPage.value = 1;
        await refreshCloudAssets();
        if (result.jobId > 0) await bindActiveTask(result.jobId);
      } catch (e) {
        notifyDeleteOpError(e);
        throw e;
      } finally {
        deletingAllSynced.value = false;
      }
    }
  });
}

async function onRetryCloudDeletes() {
  if (!guardCloudManageAction()) return;
  retryingCloudDelete.value = true;
  errorMsg.value = "";
  try {
    const result = await retryIcloudSyncCloudDeletes();
    if (result.retried === 0) {
      message.info("没有需要从 iCloud 移除的失败项");
    } else {
      message.success(`已重新安排 ${result.retried} 项从 iCloud 移除`);
      await refreshCloudAssets();
      if (result.jobId > 0) await bindActiveTask(result.jobId);
    }
  } catch (e) {
    notifyDeleteOpError(e);
  } finally {
    retryingCloudDelete.value = false;
  }
}

watch(jobStatus, (status, prev) => {
  if (status === "done" && prev !== "done" && isCloudDeleteTask.value && drawerOpen.value) {
    cloudFilter.value = "deleted_cloud_pending";
    cloudPage.value = 1;
    clearCloudSelection();
    void refreshCloudAssets();
  }
});

watch(canManageCloudSpace, ok => {
  if (!ok) clearCloudSelection();
});

/** 任务类型变化时自动切到对应分栏 */
watch(
  () => ({ deleteTask: isCloudDeleteTask.value, syncTask: isSyncTask.value, busy: hasIncompleteTask.value }),
  ({ deleteTask, syncTask, busy }) => {
    if (!busy) return;
    if (deleteTask) drawerMode.value = "free";
    else if (syncTask) drawerMode.value = "pull";
  }
);

/** 「同步到本地」串联阶段 taskType 仍为 catalog，用 starting 切回拉取栏 */
watch(starting, v => {
  if (v) drawerMode.value = "pull";
});

watch(drawerMode, mode => {
  clearCloudSelection();
  cloudPage.value = 1;
  cloudFilter.value = defaultFilterForMode(mode);
  refreshCloudIfVisible();
});

watch(drawerOpen, open => {
  if (open) refreshCloudIfVisible();
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
  errorMsg.value = "";
  try {
    await onLogoutAccount();
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
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
      <IconifyIcon v-else :icon="iconName" :class="{ breathing: fabState.breathing }" width="26" height="26" />
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
        <a-tag color="success" class="drawer-extra-tag">{{ maskedCurrentAppleId }}</a-tag>
        <a-button type="link" size="small" danger :loading="loggingOut" @click="onLogout">退出</a-button>
      </a-space>
      <a-button v-else type="link" size="small" @click="authModalOpen = true">登录</a-button>
    </template>

    <div class="drawer-body">
      <!-- 进度/主操作在分栏之上：全局单任务，与当前 Tab 无关 -->
      <div class="upper-panel">
        <IcloudSyncStatusCard />
      </div>

      <a-segmented v-model:value="drawerMode" class="mode-switch" :options="DRAWER_MODE_OPTIONS" block />

      <template v-if="isLoggedIn">
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
              <a-range-picker
                v-model:value="cloudDateRange"
                class="cloud-date-range"
                :placeholder="['拍摄时间起始', '拍摄时间结束']"
                allow-clear
                @change="onCloudFilterChange"
              />
            </div>
            <div class="toolbar-right">
              <template v-if="drawerMode === 'free'">
                <a-tooltip v-bind="canManageCloudSpace ? {} : { title: TASK_BUSY_HINT }">
                  <a-button :loading="refreshingCatalog" :disabled="!canManageCloudSpace" @click="onRefreshCatalogClick()"> 刷新状态 </a-button>
                </a-tooltip>
                <a-button
                  v-if="cloudSummary?.failedDelete"
                  type="link"
                  size="small"
                  :loading="retryingCloudDelete"
                  :disabled="!canManageCloudSpace"
                  @click="onRetryCloudDeletes()"
                >
                  重试失败
                </a-button>
                <a-tooltip v-bind="canManageCloudSpace ? {} : { title: TASK_BUSY_HINT }">
                  <a-button type="primary" danger :loading="deleteBusy" :disabled="freeSpacePrimaryDisabled" @click="onFreeSpacePrimaryClick()">
                    {{ freeSpacePrimaryLabel }}
                  </a-button>
                </a-tooltip>
              </template>
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
                showTotal: (total: number) =>
                  drawerMode === 'free' && cloudSelectedKeys.length ? `共 ${total} 条，已选 ${cloudSelectedKeys.length} 项` : `共 ${total} 条`
              }"
              @change="onCloudTableChange"
            >
              <template #bodyCell="{ column, record, index }">
                <template v-if="column.dataIndex === 'listSeq'">
                  {{ cloudListSeq(index) }}
                </template>
                <template v-else-if="column.dataIndex === 'indexNum'">
                  {{ String((record as CloudListDisplayRow).indexNum).padStart(5, "0") }}
                </template>
                <template v-else-if="column.dataIndex === 'sortKey'">
                  {{ formatSortKeyTime((record as CloudListDisplayRow).captureAt ?? (record as CloudListDisplayRow).sortKey) }}
                </template>
                <template v-else-if="column.dataIndex === 'cloudState'">
                  <a-tag :color="(record as CloudListDisplayRow).displayStateColor">
                    {{ (record as CloudListDisplayRow).displayStateLabel }}
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

      <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="drawer-error" />
    </div>

    <IcloudSyncAuthModal v-model:open="authModalOpen" @logged-in="onLoggedIn" @logged-out="onLoggedOut" />
  </a-drawer>
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
  border: 2px solid currentColor;
  background: var(--color-bg-container, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s;
  &:hover {
    transform: scale(1.08);
    background: var(--color-bg-container, #fff);
    border-color: currentColor;
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
.mode-switch {
  flex-shrink: 0;
}
.drawer-error {
  flex-shrink: 0;
  margin-bottom: 0;
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
.cloud-date-range {
  width: 260px;
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
</style>
