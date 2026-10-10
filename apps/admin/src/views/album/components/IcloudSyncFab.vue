<!--
  iCloud 下载浮动触发区
  职责：右下角 FAB；抽屉工具栏 + 宫格四态；意图先行（下载/移除）；忙时底栏进度
  主流程：hydrate → FAB → 工具栏（同步到本地 / 下载 / 移除）→ 宫格；
  意图：点功能 → 筛态 → 勾选/框选 → 再点执行；成功不自动退出；其它意图按钮禁用须先取消；删云失败项保留勾选
  @note 方案 3：全量轻量元数据进内存 + 虚拟宫格（仅挂视口）；框选按几何命中全量 placements
-->
<script setup lang="ts">
import IcloudSyncAuthPanel from "./IcloudSyncAuthPanel.vue";
import IcloudSyncDeleteDialog from "./IcloudSyncDeleteDialog.vue";
import IcloudSyncFooter from "./IcloudSyncFooter.vue";
import IcloudSyncFabWave from "./IcloudSyncFabWave.vue";
import ProtocolLazyThumb from "./ProtocolLazyThumb.vue";
import SyncFabShell from "./SyncFabShell.vue";
import { MIN_MARQUEE_PX, useMarqueeDrag } from "../useMarqueeDrag";
import {
  buildIcloudCloudLayout,
  computeIcloudCloudGrid,
  hitTestIcloudCloudPlacements,
  ICLOUD_CLOUD_GRID,
  sliceVisibleIcloudCloudPlacements
} from "../icloudSyncCloudLayout";
import {
  formatIcloudSyncError,
  getIcloudSyncCloudStateSummary,
  loadIcloudSyncCloudList,
  type IcloudSyncCloudStateFilter,
  type IcloudSyncCloudStateSummary,
  type IcloudSyncDeleteAssetItem
} from "@/api/icloudSync";
import {
  cloudListRowsToAssetItems,
  cloudListDisplayState,
  cloudListDisplayFilename,
  cloudStateLabel,
  cloudStateTagColor,
  type IcloudSyncCloudListRow
} from "@/utils/icloudSyncCloudList";
import $feedback from "@/utils/feedback";
import dayjs from "dayjs";
import { useElementSize, useScroll, useThrottleFn } from "@vueuse/core";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSyncFab" });

/** 意图先行：null=混排浏览；download/delete=筛态勾选 */
type CloudIntent = null | "download" | "delete";

type CloudListDisplayRow = IcloudSyncCloudListRow & {
  displayFilename: string;
  displayStateLabel: string;
  /** a-tag color：success / processing / error / default */
  displayStateTagColor: string;
  /** 来自 iCloud Hidden 相册 */
  isHidden: boolean;
  /** 来自 Shared Photo Library */
  isShared: boolean;
};

const {
  fabState,
  isLoggedIn,
  maskedCurrentAppleId,
  cloudStateTick,
  downloadProgressTick,
  canManageCloudSpace,
  refreshingCatalog,
  starting,
  showSyncFooter,
  onRefreshCatalog,
  onSyncToLocal,
  onStartSelected,
  onLoggedIn,
  onLogoutAccount,
  hydrateFromStorage,
  refreshAccountSettings,
  reportBusinessError
} = useIcloudSyncJob();

const drawerOpen = ref(false);
const loggingOut = ref(false);

/** 抽屉打开且未登录：内嵌登录面板（替代原弹窗） */
const authPanelActive = computed(() => drawerOpen.value && !isLoggedIn.value);

/** 意图筛选：idle=全部；下载=待下载；移除=已下载（失败并进待下载筛选语义由展示态覆盖） */
const intent = ref<CloudIntent>(null);
const cloudListState = computed<IcloudSyncCloudStateFilter>(() => {
  if (intent.value === "download") return "cloud_only";
  if (intent.value === "delete") return "synced";
  return "all";
});
const selectMode = computed(() => intent.value != null);

/** 轻量全量单次拉取上限（与 Rust clamp 一致） */
const CLOUD_META_CHUNK = 2000;
const cloudTotal = ref(0);
/** 当前筛选下全量展示行（轻量元数据；DOM 仅挂可视切片） */
const cloudRows = ref<CloudListDisplayRow[]>([]);
const cloudSummary = ref<IcloudSyncCloudStateSummary | null>(null);
const loadingCloud = ref(false);
const deletingCloud = ref(false);
const deleteDialogOpen = ref(false);
const deleteDialogItems = ref<IcloudSyncDeleteAssetItem[]>([]);
const cloudSelectedKeys = ref<string[]>([]);
/** 勾选 row 快照（按 id；虚拟列表下 DOM 不全） */
const cloudSelectedRowsByKey = ref(new Map<string, CloudListDisplayRow>());

function clearCloudSelection() {
  cloudSelectedKeys.value = [];
  cloudSelectedRowsByKey.value = new Map();
}

/** 从勾选中去掉指定 rowKey，不退出意图 */
function removeCloudSelectionKeys(keys: string[]) {
  if (keys.length === 0) return;
  const drop = new Set(keys);
  cloudSelectedKeys.value = cloudSelectedKeys.value.filter(k => !drop.has(k));
  const nextMap = new Map(cloudSelectedRowsByKey.value);
  for (const key of drop) nextMap.delete(key);
  cloudSelectedRowsByKey.value = nextMap;
}

function exitIntent() {
  intent.value = null;
  clearCloudSelection();
  void refreshCloudAssets();
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

const selectedCloudCount = computed(() => cloudSelectedKeys.value.length);

/** 当前意图下该行是否可勾选 */
function canSelectCloudRow(row: CloudListDisplayRow): boolean {
  if (!canManageCloudSpace.value || !intent.value) return false;
  const state = cloudListDisplayState(row);
  if (intent.value === "delete") return state === "synced";
  // 下载意图：待下载；失败行若仍在列表（活跃 job 外通常已回 cloud_only）也可勾
  return state === "cloud_only" || state === "download_failed";
}

function isCloudRowSelected(row: CloudListDisplayRow): boolean {
  return cloudSelectedKeys.value.includes(row.rowKey);
}

function toggleCloudRowSelect(row: CloudListDisplayRow) {
  if (!canSelectCloudRow(row)) return;
  const nextKeys = isCloudRowSelected(row) ? cloudSelectedKeys.value.filter(k => k !== row.rowKey) : [...cloudSelectedKeys.value, row.rowKey];
  const nextKeySet = new Set(nextKeys);
  const nextMap = new Map(cloudSelectedRowsByKey.value);
  for (const key of [...nextMap.keys()]) {
    if (!nextKeySet.has(key)) nextMap.delete(key);
  }
  if (nextKeySet.has(row.rowKey)) nextMap.set(row.rowKey, row);
  cloudSelectedKeys.value = nextKeys;
  cloudSelectedRowsByKey.value = nextMap;
}

/** 意图内点格切换勾选；空闲不预览（同步抽屉灯箱已去掉：非大图且无实况/视频） */
function onCloudCellClick(row: CloudListDisplayRow) {
  if (!intent.value) return;
  if (!canSelectCloudRow(row)) {
    $feedback.message.info(intent.value === "delete" ? "仅已下载到本地的项可勾选移除" : "仅待下载项可勾选下载");
    return;
  }
  toggleCloudRowSelect(row);
}

const cloudGridScrollRef = ref<HTMLElement | null>(null);
const cloudGridFrameRef = ref<HTMLElement | null>(null);
const { width: cloudGridWidth, height: cloudViewportHeight } = useElementSize(cloudGridScrollRef);
const { y: cloudScrollTop } = useScroll(cloudGridScrollRef, { throttle: 60 });

const cloudGridMetrics = computed(() => computeIcloudCloudGrid(Math.max(0, cloudGridWidth.value - 4)));
const cloudFullLayout = computed(() =>
  buildIcloudCloudLayout(cloudRows.value, cloudGridMetrics.value.cols, cloudGridMetrics.value.cellSize)
);
const cloudBufferPx = computed(() => Math.max(120, ICLOUD_CLOUD_GRID.bufferRows * (cloudGridMetrics.value.cellSize + ICLOUD_CLOUD_GRID.gap)));
const cloudVisiblePlacements = computed(() =>
  sliceVisibleIcloudCloudPlacements(cloudFullLayout.value.placements, cloudScrollTop.value, cloudViewportHeight.value, cloudBufferPx.value)
);

function cloudPlacementStyle(p: { left: number; top: number; width: number; height: number }): Record<string, string> {
  return {
    left: `${p.left}px`,
    top: `${p.top}px`,
    width: `${p.width}px`,
    height: `${p.height}px`
  };
}

/** 框选开始前的勾选快照；拖太短或取消时还原 */
let cloudSelectSnapshot: { keys: string[]; rows: Map<string, CloudListDisplayRow> } | null = null;

/**
 * 框选累加：几何命中全量 placements（不依赖虚拟未挂载的 DOM）
 */
function applyCloudMarquee(keys: string[]) {
  const nextMap = new Map<string, CloudListDisplayRow>();
  if (cloudSelectSnapshot) {
    for (const [key, row] of cloudSelectSnapshot.rows) {
      nextMap.set(key, row);
    }
  }
  const want = new Set(keys);
  for (const row of cloudRows.value) {
    if (!want.has(row.rowKey) || !canSelectCloudRow(row)) continue;
    nextMap.set(row.rowKey, row);
  }
  cloudSelectedKeys.value = [...nextMap.keys()];
  cloudSelectedRowsByKey.value = nextMap;
}

function restoreCloudSelectSnapshot() {
  if (!cloudSelectSnapshot) return;
  cloudSelectedKeys.value = [...cloudSelectSnapshot.keys];
  cloudSelectedRowsByKey.value = new Map(cloudSelectSnapshot.rows);
}

const {
  marqueeStyle: cloudMarqueeStyle,
  marqueeActive: cloudMarqueeActive,
  onPointerDown: onCloudMarqueePointerDown,
  onDragStart: onCloudDragStart
} = useMarqueeDrag({
  onBegin() {
    cloudSelectSnapshot = {
      keys: [...cloudSelectedKeys.value],
      rows: new Map(cloudSelectedRowsByKey.value)
    };
  },
  onUpdate(box) {
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      restoreCloudSelectSnapshot();
      return;
    }
    applyCloudMarquee(hitTestIcloudCloudPlacements(cloudFullLayout.value.placements, box));
  },
  onEnd(committed) {
    if (!committed) restoreCloudSelectSnapshot();
    cloudSelectSnapshot = null;
  }
});

function onCloudPointerDown(event: PointerEvent) {
  if (!canManageCloudSpace.value || !intent.value) return;
  const scroll = cloudGridScrollRef.value;
  const frame = cloudGridFrameRef.value;
  if (!scroll || !frame) return;
  onCloudMarqueePointerDown(event, { scrollEl: scroll, frameEl: frame });
}
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

const downloadIntentLabel = computed(() => (intent.value === "download" ? `批量下载 (${selectedCloudCount.value})` : "批量下载"));
const deleteIntentLabel = computed(() => (intent.value === "delete" ? `批量移除 (${selectedCloudCount.value})` : "批量移除"));

/**
 * 进入意图：仅空闲可进；已在其它意图时须先取消（禁止直接切换）
 * @param next download | delete
 * @returns 是否已进入该意图
 */
function enterIntent(next: "download" | "delete"): boolean {
  if (!guardCloudManageAction()) return false;
  if (intent.value === next) return true;
  if (intent.value != null) return false;
  clearCloudSelection();
  intent.value = next;
  void refreshCloudAssets();
  return true;
}

/** 意图先行：下载 — 首次进入筛选；再次点击执行子集入队 */
async function onDownloadIntentClick() {
  if (!guardCloudManageAction()) return;
  if (intent.value !== "download") {
    enterIntent("download");
    return;
  }
  if (selectedCloudCount.value === 0) {
    $feedback.message.warning("请先勾选要下载的照片");
    return;
  }
  const selected = selectedCloudRows();
  const ids = selected.map(r => r.assetId);
  const keys = selected.map(r => r.rowKey);
  const ok = await onStartSelected(ids);
  if (ok) {
    // 已入队项移出勾选，保留下载意图，便于继续挑下一批（任务占用时执行仍会被挡）
    removeCloudSelectionKeys(keys);
    void refreshCloudAssets();
  }
}

/** 意图先行：移除 — 首次进入筛选；再次点击走删云确认 */
function onDeleteIntentClick() {
  if (!guardCloudManageAction()) return;
  if (intent.value !== "delete") {
    enterIntent("delete");
    return;
  }
  confirmDeleteCloud();
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

function toDisplayRow(row: IcloudSyncCloudListRow): CloudListDisplayRow {
  const displayRow: IcloudSyncCloudListRow = { ...row, rowKey: row.assetId };
  const state = cloudListDisplayState(displayRow);
  return {
    ...displayRow,
    displayFilename: cloudListDisplayFilename(displayRow),
    displayStateLabel: cloudStateLabel(state),
    displayStateTagColor: cloudStateTagColor(state),
    isHidden: row.catalogScope === "hidden",
    isShared: row.catalogScope === "shared"
  };
}

/**
 * 拉取当前筛选下全量轻量元数据（跳过 is_file；分片直至完备）
 */
async function fetchAllCloudMeta(): Promise<CloudListDisplayRow[]> {
  const acc: CloudListDisplayRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const list = await loadIcloudSyncCloudList({
      offset,
      limit: CLOUD_META_CHUNK,
      cloudState: cloudListState.value,
      checkLocalFile: false
    });
    total = list.total;
    acc.push(...list.items.map(toDisplayRow));
    if (list.items.length === 0) break;
    offset += list.items.length;
    if (offset > 100_000) break;
  }
  return acc;
}

/**
 * 刷新云列表（全量轻量元数据 → 虚拟宫格）
 * @param silent 进度回写：不亮 loading，避免蒙层闪空
 */
async function refreshCloudAssets(opts?: { silent?: boolean }) {
  if (!isLoggedIn.value) return;
  const silent = opts?.silent === true;
  if (!silent) loadingCloud.value = true;
  try {
    const summary = await getIcloudSyncCloudStateSummary();
    cloudSummary.value = summary;
    const rows = await fetchAllCloudMeta();
    cloudRows.value = rows;
    cloudTotal.value = rows.length;
    refreshSelectedRowsFromPage(cloudRows.value);
  } catch (e) {
    if (!silent) await reportBusinessError(e);
  } finally {
    if (!silent) loadingCloud.value = false;
  }
}

/** 抽屉打开且已登录时刷新列表 */
function refreshCloudIfVisible(opts?: { silent?: boolean }) {
  if (!drawerOpen.value || !isLoggedIn.value) return;
  void refreshCloudAssets(opts);
}

/** iCloud 移除说明：本地保留 + 最近删除（Modal 与提示共用） */
const ICLOUD_REMOVE_HINT =
  "只删除 iCloud 上的副本，电脑里的文件会保留。照片会先进入 iCloud「最近删除」，通常约 30 天后才彻底释放空间；此期间可在 iPhone 或 iCloud.com 恢复。";

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
    /* 结果由 onConfirm 自行展示；此处吞掉避免未处理 rejection */
  }
}

/** 从 iCloud 移除所选（一次性；本机保留）；确认后交给进度弹窗执行 */
function confirmDeleteCloud() {
  if (!guardCloudManageAction()) return;
  const selected = selectedCloudRows().filter(row => row.cloudState === "synced");
  if (selected.length === 0) {
    $feedback.message.warning("请先勾选要从 iCloud 移除的照片（须已下载到本地）");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除所选 ${selected.length} 项？`,
    content: ICLOUD_REMOVE_HINT,
    onConfirm: async () => {
      if (deletingCloud.value) return;
      deletingCloud.value = true;
      deleteDialogItems.value = cloudListRowsToAssetItems(selected);
      deleteDialogOpen.value = true;
    }
  });
}

/** 删云结束：只保留未移除成功项的勾选（rowKey 即 assetId），再刷新列表；不退出意图 */
async function onCloudDeleteFinished(keepAssetIds: string[]) {
  const keep = new Set(keepAssetIds);
  const nextMap = new Map<string, CloudListDisplayRow>();
  for (const [key, row] of cloudSelectedRowsByKey.value) {
    if (keep.has(row.assetId)) nextMap.set(key, row);
  }
  cloudSelectedKeys.value = [...nextMap.keys()];
  cloudSelectedRowsByKey.value = nextMap;
  try {
    await refreshCloudAssets();
  } finally {
    deletingCloud.value = false;
  }
}

watch(drawerOpen, open => {
  if (open) {
    // A′：开抽屉只刷 settings 展示，不 auth_probe
    void refreshAccountSettings();
    refreshCloudIfVisible();
  } else if (intent.value) {
    intent.value = null;
    clearCloudSelection();
  }
});

watch(isLoggedIn, () => refreshCloudIfVisible());

/** catalog / 完成等态变更：静默回写角标，不打断浏览 */
watch(cloudStateTick, () => refreshCloudIfVisible({ silent: true }));

/** 下载中 progress：静默刷新态，禁止 loading 蒙层整表闪 */
const throttledRefreshOnDownload = useThrottleFn(() => refreshCloudIfVisible({ silent: true }), 1200, true, true);
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
  <SyncFabShell
    v-model:drawer-open="drawerOpen"
    storage-key="album.icloudSyncFab.pos"
    default-edge="right"
    drawer-title="iCloud 下载"
    drawer-class="icloud-sync-drawer"
  >
    <template #fab>
      <a-button class="fab-btn" :class="`fab-${fabState.color}`" shape="circle" size="large" :title="fabState.label">
        <IcloudSyncFabWave v-if="showProgress" :percent="fabState.percent" :tone="fabState.color" :size="46" />
        <CcIconifyIcon v-else :icon="iconName" :class="{ breathing: fabState.breathing }" width="28" height="28" />
      </a-button>
    </template>

    <template #drawer-extra>
      <a-space v-if="isLoggedIn" :size="8" align="center">
        <div class="drawer-extra-tag">
          当前登录：<span>{{ maskedCurrentAppleId }}</span>
        </div>
        <a-button type="link" size="small" danger :loading="loggingOut" @click="onLogout">退出</a-button>
      </a-space>
    </template>

    <div class="drawer-body">
      <IcloudSyncAuthPanel v-if="!isLoggedIn" :active="authPanelActive" @logged-in="onLoggedIn" />

      <template v-else>
        <div class="cloud-toolbar">
          <div class="toolbar-actions">
            <div class="toolbar-left">
              <a-tooltip v-bind="canManageCloudSpace ? { title: '先更新状态，再同步全部待下载项' } : { title: TASK_BUSY_HINT }" placement="bottom">
                <a-button type="primary" :loading="starting" :disabled="!canManageCloudSpace" @click="onSyncToLocal()">下载全部</a-button>
              </a-tooltip>
              <a-tooltip
                v-bind="
                  !canManageCloudSpace
                    ? { title: TASK_BUSY_HINT }
                    : intent && intent !== 'download'
                      ? { title: '请先取消当前操作' }
                      : { title: '挑选待下载项后再下' }
                "
                placement="bottom"
              >
                <a-button
                  type="primary"
                  :ghost="intent !== 'download'"
                  :loading="starting && intent === 'download'"
                  :disabled="!canManageCloudSpace || (!!intent && intent !== 'download')"
                  @click="onDownloadIntentClick"
                >
                  {{ downloadIntentLabel }}
                </a-button>
              </a-tooltip>
              <a-tooltip
                v-bind="
                  !canManageCloudSpace
                    ? { title: TASK_BUSY_HINT }
                    : intent && intent !== 'delete'
                      ? { title: '请先取消当前操作' }
                      : { title: '挑选已下载项后从 iCloud 移除' }
                "
                placement="bottom"
              >
                <a-button
                  danger
                  :type="intent !== 'delete' ? 'default' : 'primary'"
                  :loading="deletingCloud"
                  :disabled="!canManageCloudSpace || (!!intent && intent !== 'delete')"
                  @click="onDeleteIntentClick"
                >
                  {{ deleteIntentLabel }}
                </a-button>
              </a-tooltip>
              <a-button v-if="intent" @click="exitIntent">取消</a-button>
            </div>
            <div class="toolbar-right">
              <a-button
                shape="circle"
                :loading="refreshingCatalog"
                :disabled="!canManageCloudSpace"
                :title="canManageCloudSpace ? '' : TASK_BUSY_HINT"
                @click="onRefreshCatalogClick()"
              >
                <template #icon>
                  <CcIconifyIcon icon="ant-design:reload-outlined" width="16px" height="16px" />
                </template>
              </a-button>
            </div>
          </div>
        </div>

        <div class="cloud-grid-wrap">
          <div v-if="loadingCloud" class="cloud-grid-loading" aria-busy="true">
            <a-spin />
          </div>
          <div
            ref="cloudGridScrollRef"
            class="cloud-grid-scroll"
            :class="{ 'is-marquee': cloudMarqueeActive }"
            @pointerdown="onCloudPointerDown"
            @dragstart="onCloudDragStart"
          >
            <div
              v-if="cloudRows.length"
              ref="cloudGridFrameRef"
              class="cloud-grid-canvas"
              :style="{ height: `${cloudFullLayout.totalHeight}px` }"
            >
              <div
                v-for="p in cloudVisiblePlacements"
                :key="p.rowKey"
                class="cloud-cell"
                :data-row-key="p.rowKey"
                :style="cloudPlacementStyle(p)"
                :class="{ selected: selectMode && isCloudRowSelected(p.row), 'select-mode': selectMode }"
                :title="`${p.row.displayFilename}\n${formatSortKeyTime(p.row.captureAt ?? p.row.sortKey)} · ${p.row.displayStateLabel}`"
                @click="onCloudCellClick(p.row)"
              >
                <ProtocolLazyThumb
                  protocol="icloudimg"
                  :asset-id="p.row.assetId"
                  :scroll-root="cloudGridScrollRef"
                  :kind="p.row.mediaKind === 'video' ? 'video' : p.row.mediaKind === 'live' ? 'livephoto' : 'image'"
                  :ext="p.row.displayFilename?.split('.').pop()"
                />
                <a-tag class="cell-state" :color="p.row.displayStateTagColor" :bordered="false">{{ p.row.displayStateLabel }}</a-tag>
                <span v-if="p.row.isHidden" class="cell-hidden" title="iCloud 隐藏相册">🔒</span>
                <span v-if="p.row.isShared" class="cell-shared" title="iCloud 共享图库">👥</span>
              </div>
              <div v-if="cloudMarqueeStyle" class="sync-marquee" :style="cloudMarqueeStyle" />
            </div>
            <a-empty v-else-if="!loadingCloud" description="当前筛选下暂无内容" :image="false" />
          </div>
          <div class="cloud-grid-foot">
            <span v-if="cloudTotal > 0" class="cloud-grid-count">
              {{ selectMode && selectedCloudCount ? `共 ${cloudTotal} 条，已选 ${selectedCloudCount} 项` : `共 ${cloudTotal} 条` }}
            </span>
          </div>
        </div>

        <IcloudSyncFooter v-if="showSyncFooter" />
      </template>
    </div>

  </SyncFabShell>
  <IcloudSyncDeleteDialog v-model:open="deleteDialogOpen" :items="deleteDialogItems" @finished="onCloudDeleteFinished" />
</template>

<style scoped lang="scss">
.fab-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  cursor: inherit;
  background: var(--color-bg-container);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  transition: transform 0.2s;
  &:hover,
  &:active {
    transform: scale(1.08);
    background: var(--color-bg-container);
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
  color: var(--color-success);
}
.fab-warning {
  color: var(--color-warning);
}
.fab-error {
  color: var(--color-error);
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
  span {
    color: var(--color-primary);
  }
}
.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: 16px;
}
.cloud-toolbar {
  flex-shrink: 0;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cloud-grid-wrap {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.cloud-grid-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-mask);
  pointer-events: none;
}
.cloud-grid-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 2px 8px;
  user-select: none;
  &.is-marquee {
    cursor: crosshair;
  }
}
.cloud-grid-canvas {
  position: relative;
  width: 100%;
}
.sync-marquee {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  pointer-events: none;
}
.cloud-cell {
  position: absolute;
  box-sizing: border-box;
  border-radius: 8px;
  overflow: hidden;
  cursor: default;
  background: var(--color-fill-quaternary);
  &.select-mode {
    cursor: pointer;
  }
  /* 与本地相册宫格对齐：选中=压暗+主色环；未选无态；不用角标勾 */
  &.selected::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: inherit;
    background: var(--color-bg-mask-strong);
    opacity: 0.45;
    pointer-events: none;
  }
  &.selected::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 4;
    box-sizing: border-box;
    border: 2px solid var(--color-primary);
    border-radius: inherit;
    pointer-events: none;
  }
}
/* 左下角常驻；与 QQ 宫格 a-tag 角标同尺寸 */
.cell-state {
  position: absolute;
  left: 4px;
  bottom: 4px;
  z-index: 5;
  max-width: calc(100% - 28px);
  margin: 0;
  padding: 0 5px;
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.cell-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 5;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--color-bg-mask-strong);
  color: var(--color-text-light-solid);
  font-size: 11px;
  pointer-events: none;
}
.cell-hidden {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 5;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
  text-shadow: 0 0 2px var(--color-bg-mask-strong);
}
.cell-shared {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 5;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
  text-shadow: 0 0 2px var(--color-bg-mask-strong);
}
.cloud-grid-foot {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  min-height: 24px;
}
.cloud-grid-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
</style>
