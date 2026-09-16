<!--
  iCloud 下载浮动触发区
  职责：右下角 FAB；抽屉顶部全局进度 +「下载到本地」网格浏览（在线 thumb）；工具栏危险区删云
  主流程：hydrate → FAB → StatusCard → 网格筛选；点格灯箱；synced 勾选删云经确认后一次性移除（toast，不占任务队列）
-->
<script setup lang="ts">
import IcloudSyncAuthPanel from "./IcloudSyncAuthPanel.vue";
import IcloudSyncStatusCard from "./IcloudSyncStatusCard.vue";
import IcloudSyncFabWave from "./IcloudSyncFabWave.vue";
import IcloudLazyImg from "./IcloudLazyImg.vue";
import MediaLightboxShell from "./MediaLightboxShell.vue";
import {
  formatIcloudSyncError,
  getIcloudSyncCloudStateSummary,
  icloudProxiedThumbSrc,
  loadIcloudSyncCloudList,
  deleteIcloudSyncAssets,
  deleteAllSyncedIcloudAssets,
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
  type CloudListStateFilterOption,
  type IcloudSyncCloudListRow
} from "@/utils/icloudSyncCloudList";
import $feedback from "@/utils/feedback";
import dayjs, { type Dayjs } from "dayjs";
import { useDebounceFn, useDraggable, useEventListener, useThrottleFn } from "@vueuse/core";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";

defineOptions({ name: "AlbumIcloudSyncFab" });

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
  onRefreshCatalog,
  onLoggedIn,
  onLogoutAccount,
  hydrateFromStorage,
  refreshAccountSettings
} = useIcloudSyncJob();

const drawerOpen = ref(false);
const loggingOut = ref(false);

/** 抽屉打开且未登录：内嵌登录面板（替代原弹窗） */
const authPanelActive = computed(() => drawerOpen.value && !isLoggedIn.value);

/** 列表筛选项（仅「下载到本地」PULL 子集） */
const cloudFilter = ref<IcloudSyncCloudStateFilter>("cloud_only");
/** 按拍摄/加入时间区间筛选（YYYY-MM-DD） */
const cloudDateRange = ref<[Dayjs, Dayjs] | null>(null);
/** 文件名模糊搜索（对 original_filename） */
const cloudFilenameKeyword = ref("");
const cloudPage = ref(1);
const cloudPageSize = ref(100);
const cloudTotal = ref(0);
const cloudRows = ref<CloudListDisplayRow[]>([]);
/** 无限滚动：是否还有更多页 */
const cloudHasMore = ref(false);
/** 无限滚动：正在加载下一页 */
const cloudLoadingMore = ref(false);
/** 哨兵元素 + IO，触底自动加载下一页 */
const cloudSentinelRef = ref<HTMLElement | null>(null);
let cloudSentinelObserver: IntersectionObserver | null = null;
const cloudSummary = ref<IcloudSyncCloudStateSummary | null>(null);
const loadingCloud = ref(false);
const deletingCloud = ref(false);
const deletingAllSynced = ref(false);
const cloudSelectedKeys = ref<string[]>([]);
/** 跨页勾选的行快照；翻页后当前 dataSource 不含他页行，删云须用此 Map */
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

/** 已登录且可腾空间时：仅 synced 可勾选删云 */
function canSelectCloudRow(row: CloudListDisplayRow): boolean {
  return canManageCloudSpace.value && row.cloudState === "synced";
}

function isCloudRowSelected(row: CloudListDisplayRow): boolean {
  return cloudSelectedKeys.value.includes(row.rowKey);
}

function toggleCloudRowSelect(row: CloudListDisplayRow, event?: Event) {
  event?.stopPropagation();
  if (!canSelectCloudRow(row)) return;
  const selected = isCloudRowSelected(row);
  if (selected) {
    mergeCloudPageSelection(
      cloudSelectedKeys.value.filter(k => k !== row.rowKey),
      []
    );
  } else {
    mergeCloudPageSelection([...cloudSelectedKeys.value, row.rowKey], [row]);
  }
}

const cloudGridScrollRef = ref<HTMLElement | null>(null);
const previewOpen = ref(false);
/** 用 rowKey 锚定灯箱，列表刷新后仍能对上同一行 */
const previewRowKey = ref<string | null>(null);

const previewIndex = computed(() => {
  if (!previewRowKey.value) return -1;
  return cloudRows.value.findIndex(row => row.rowKey === previewRowKey.value);
});

const previewRow = computed(() => {
  const i = previewIndex.value;
  return i >= 0 ? cloudRows.value[i] : null;
});

/** 灯箱标题只用 still 原名；displayFilename 会把 Live 的 HEIC/MOV 拼进一行 */
const previewTitle = computed(() => previewRow.value?.originalFilename?.trim() || "预览");

const previewMeta = computed(() => {
  const row = previewRow.value;
  if (!row || previewIndex.value < 0) return "";
  const parts = [formatSortKeyTime(row.captureAt ?? row.sortKey), row.displayStateLabel];
  parts.push(`${previewIndex.value + 1} / ${cloudRows.value.length}`);
  return parts.join(" · ");
});

/** 网格/灯箱优先本地可读图，避免整页打满 sidecar */
function cloudRowLocalImagePath(row: CloudListDisplayRow | null | undefined): string | null {
  if (!row?.localFilePresent) return null;
  const path = row.destPath?.trim() ?? "";
  return path || null;
}

const previewSrc = computed(() => {
  const row = previewRow.value;
  if (!row?.assetId) return "";
  const local = cloudRowLocalImagePath(row);
  if (local) {
    const ext = local.slice(local.lastIndexOf(".") + 1).toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(ext)) {
      try {
        return convertFileSrc(local);
      } catch {
        /* online fallback */
      }
    }
  }
  return icloudProxiedThumbSrc(row.assetId);
});

function openCloudPreview(row: CloudListDisplayRow) {
  previewRowKey.value = row.rowKey;
  previewOpen.value = true;
}

function closeCloudPreview() {
  previewOpen.value = false;
  previewRowKey.value = null;
}

function navCloudPreview(delta: number) {
  const next = previewIndex.value + delta;
  if (next < 0 || next >= cloudRows.value.length) return;
  previewRowKey.value = cloudRows.value[next].rowKey;
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

/** Tab：PULL 子集；下载失败角标为 0 时隐藏该项 */
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
  if (cloudFilter.value !== prev) cloudPage.value = 1; // refreshCloudAssets 会重置，保留语义
}

/** Tab 角标数字；0 返回 null */
function summaryTabCountNum(key?: keyof IcloudSyncCloudStateSummary): number | null {
  if (!key || !cloudSummary.value) return null;
  const count = cloudSummary.value[key] as number | undefined;
  if (!count || count <= 0) return null;
  return count;
}

const deleteBusy = computed(() => deletingCloud.value || deletingAllSynced.value);

/** 有勾选 → 移除所选；否则 → 移除全部已下载 */
const deleteCloudPrimaryLabel = computed(() => (cloudSelectedKeys.value.length > 0 ? `移除所选（${cloudSelectedKeys.value.length}）` : "移除全部已下载"));

const deleteCloudPrimaryDisabled = computed(() => {
  if (!canManageCloudSpace.value || deleteBusy.value) return true;
  if (cloudSelectedKeys.value.length > 0) return false;
  return !cloudSummary.value?.synced;
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
    cloudPage.value = 1;
    const list = await loadIcloudSyncCloudList({
      offset: 0,
      limit: cloudPageSize.value,
      cloudState: cloudFilter.value,
      ...cloudDateBounds(),
      filenameKeyword: cloudFilenameKeyword.value.trim() || undefined
    });
    cloudRows.value = list.items.map(toDisplayRow);
    cloudTotal.value = list.total;
    cloudHasMore.value = cloudRows.value.length < list.total;
    refreshSelectedRowsFromPage(cloudRows.value);
    resetCloudSentinel();
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    loadingCloud.value = false;
  }
}

/** 无限滚动：加载下一页 */
async function loadMoreCloudAssets() {
  if (!isLoggedIn.value || cloudLoadingMore.value || !cloudHasMore.value) return;
  cloudLoadingMore.value = true;
  try {
    const next = cloudPage.value + 1;
    const list = await loadIcloudSyncCloudList({
      offset: (next - 1) * cloudPageSize.value,
      limit: cloudPageSize.value,
      cloudState: cloudFilter.value,
      ...cloudDateBounds(),
      filenameKeyword: cloudFilenameKeyword.value.trim() || undefined
    });
    const rows = list.items.map(toDisplayRow);
    cloudRows.value = [...cloudRows.value, ...rows];
    cloudPage.value = next;
    cloudTotal.value = list.total;
    cloudHasMore.value = cloudRows.value.length < list.total;
    refreshSelectedRowsFromPage(cloudRows.value);
  } catch (e) {
    $feedback.message.error(formatIcloudSyncError(e));
  } finally {
    cloudLoadingMore.value = false;
  }
}

function toDisplayRow(row: IcloudSyncCloudListRow): CloudListDisplayRow {
  const displayRow: IcloudSyncCloudListRow = { ...row, rowKey: row.assetId };
  const state = cloudListDisplayState(displayRow);
  return {
    ...displayRow,
    displayFilename: cloudListDisplayFilename(displayRow),
    displayStateLabel: cloudStateLabel(state),
    displayStateColor: cloudStateColor(state)
  };
}

/** 哨兵 IO：触底加载下一页 */
function resetCloudSentinel() {
  cloudSentinelObserver?.disconnect();
  cloudSentinelObserver = null;
  nextTick(() => {
    const el = cloudSentinelRef.value;
    const root = cloudGridScrollRef.value;
    if (!el || !root) return;
    cloudSentinelObserver = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && cloudHasMore.value && !cloudLoadingMore.value) {
          void loadMoreCloudAssets();
        }
      },
      { root, rootMargin: "200px 0px", threshold: 0 }
    );
    cloudSentinelObserver.observe(el);
  });
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

/** 抽屉打开且已登录时刷新列表 */
function refreshCloudIfVisible() {
  if (!drawerOpen.value || !isLoggedIn.value) return;
  void refreshCloudAssets();
}

/** iCloud 移除说明：本地保留 + 最近删除（Modal 与提示共用） */
const ICLOUD_REMOVE_HINT =
  "只删除 iCloud 上的副本，电脑里的文件会保留。照片会先进入 iCloud「最近删除」，通常约 30 天后才彻底释放空间；此期间可在 iPhone 或 iCloud.com 恢复。";

/**
 * 一次性删云结果 toast（对齐 QQ：不入任务队列、无全屏浮层）
 */
function notifyDeleteResult(result: IcloudSyncDeleteAssetsResult) {
  const parts: string[] = [];
  if (result.deleted > 0) parts.push(`已移除 ${result.deleted} 项`);
  if (result.failed > 0) parts.push(`失败 ${result.failed} 项`);
  if (result.rejectedLocalMissing > 0) {
    parts.push(`${result.rejectedLocalMissing} 项本地文件缺失已跳过`);
  }
  if (result.rejectedMissingCpl > 0) {
    parts.push(`${result.rejectedMissingCpl} 项缺云端元数据`);
  }
  const otherRejected = result.rejected - (result.rejectedLocalMissing ?? 0) - (result.rejectedMissingCpl ?? 0);
  if (otherRejected > 0) parts.push(`${otherRejected} 项已跳过`);
  const text = result.message?.trim() || parts.join("，") || "操作完成";
  if (result.failed > 0 && result.deleted === 0) $feedback.message.error(text);
  else if (result.failed > 0 || result.rejected > 0) $feedback.message.warning(text);
  else $feedback.message.success(text);
}

/**
 * 删云相关操作失败：轻提示，不写抽屉底栏
 * @note 「没有可删除…」属可纠正条件，用 warning
 */
function notifyDeleteOpError(e: unknown) {
  const text = formatIcloudSyncError(e);
  if (text.includes("没有可删除")) $feedback.message.warning(text);
  else $feedback.message.error(text);
}

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

/** 从 iCloud 移除所选（一次性；本机保留） */
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
      deletingCloud.value = true;
      try {
        const result = await deleteIcloudSyncAssets(cloudListRowsToAssetItems(selected));
        notifyDeleteResult(result);
        clearCloudSelection();
        await refreshCloudAssets();
      } catch (e) {
        notifyDeleteOpError(e);
        throw e;
      } finally {
        deletingCloud.value = false;
      }
    }
  });
}

/** 全部已下载项从 iCloud 移除（跨页；一次性） */
function confirmDeleteAllSynced() {
  if (!guardCloudManageAction()) return;
  const syncedCount = cloudSummary.value?.synced ?? 0;
  if (syncedCount <= 0) {
    $feedback.message.info("没有已下载到本地、可从 iCloud 移除的项");
    return;
  }

  openDeleteConfirmModal({
    title: `从 iCloud 移除全部已下载项（约 ${syncedCount} 项）？`,
    content: `${ICLOUD_REMOVE_HINT} 本地文件缺失的项会自动跳过。`,
    onConfirm: async () => {
      deletingAllSynced.value = true;
      try {
        const result = await deleteAllSyncedIcloudAssets();
        notifyDeleteResult(result);
        clearCloudSelection();
        await refreshCloudAssets();
      } catch (e) {
        notifyDeleteOpError(e);
        throw e;
      } finally {
        deletingAllSynced.value = false;
      }
    }
  });
}

watch(canManageCloudSpace, ok => {
  if (!ok) clearCloudSelection();
});

watch(drawerOpen, open => {
  if (open) {
    // A′：开抽屉只刷 settings 展示，不 auth_probe
    void refreshAccountSettings();
    refreshCloudIfVisible();
  } else {
    closeCloudPreview();
  }
});

watch(previewIndex, index => {
  if (previewOpen.value && index < 0) closeCloudPreview();
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

/** FAB 可拖到边角，避免挡住列表勾选/改拍摄时间等操作；位置落本地 */
const FAB_POS_STORAGE_KEY = "album.icloudSyncFab.pos";
const FAB_SIZE_PX = 58;
const FAB_EDGE_MARGIN_PX = 8;
const FAB_DRAG_CLICK_THRESHOLD_PX = 12;

const fabRootRef = ref<HTMLElement | null>(null);
/** 本轮拖动位移超阈值时不当作点击；打开抽屉改在 pointerup（避免 click 被吞） */
let fabDragOrigin = { x: 0, y: 0 };
let fabDragMoved = false;

function defaultFabPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return {
    x: Math.max(FAB_EDGE_MARGIN_PX, window.innerWidth - FAB_SIZE_PX - 24),
    y: Math.max(FAB_EDGE_MARGIN_PX, window.innerHeight - FAB_SIZE_PX - 24)
  };
}

/** CS 顶栏高度（Web 为 0）；拖动上界须避开 CsToolsBar */
function csShellBarHeightPx(): number {
  if (typeof document === "undefined") return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-shell-bar-height")) || 0;
}

function clampFabPos(x: number, y: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const minY = csShellBarHeightPx() + FAB_EDGE_MARGIN_PX;
  const maxX = Math.max(FAB_EDGE_MARGIN_PX, window.innerWidth - FAB_SIZE_PX - FAB_EDGE_MARGIN_PX);
  const maxY = Math.max(minY, window.innerHeight - FAB_SIZE_PX - FAB_EDGE_MARGIN_PX);
  return {
    x: Math.min(Math.max(FAB_EDGE_MARGIN_PX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY)
  };
}

function readStoredFabPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(FAB_POS_STORAGE_KEY);
    if (!raw) return defaultFabPos();
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return defaultFabPos();
    return clampFabPos(parsed.x, parsed.y);
  } catch {
    return defaultFabPos();
  }
}

function persistFabPos(x: number, y: number) {
  try {
    localStorage.setItem(FAB_POS_STORAGE_KEY, JSON.stringify({ x, y }));
  } catch {
    /* 隐私模式 / 配额满时忽略 */
  }
}

const {
  x: fabX,
  y: fabY,
  style: fabDragStyle,
  isDragging: fabDragging
} = useDraggable(fabRootRef, {
  initialValue: typeof window !== "undefined" ? readStoredFabPos() : { x: 24, y: 24 },
  preventDefault: false,
  onStart(pos) {
    fabDragMoved = false;
    fabDragOrigin = { x: pos.x, y: pos.y };
  },
  onMove(pos) {
    const next = clampFabPos(pos.x, pos.y);
    if (next.x !== pos.x || next.y !== pos.y) {
      fabX.value = next.x;
      fabY.value = next.y;
    }
    if (Math.abs(pos.x - fabDragOrigin.x) > FAB_DRAG_CLICK_THRESHOLD_PX || Math.abs(pos.y - fabDragOrigin.y) > FAB_DRAG_CLICK_THRESHOLD_PX) {
      fabDragMoved = true;
    }
  },
  onEnd(pos) {
    const next = clampFabPos(pos.x, pos.y);
    fabX.value = next.x;
    fabY.value = next.y;
    persistFabPos(next.x, next.y);
    if (!fabDragMoved) {
      drawerOpen.value = true;
    }
  }
});

useEventListener(window, "resize", () => {
  const next = clampFabPos(fabX.value, fabY.value);
  fabX.value = next.x;
  fabY.value = next.y;
});

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
  const next = readStoredFabPos();
  fabX.value = next.x;
  fabY.value = next.y;
  if (isTauri()) void hydrateFromStorage();
});

onBeforeUnmount(() => {
  cloudSentinelObserver?.disconnect();
  cloudSentinelObserver = null;
});
</script>

<template>
  <div ref="fabRootRef" class="fab-root" :class="{ 'is-dragging': fabDragging }" :style="fabDragStyle">
    <a-button class="fab-btn" :class="`fab-${fabState.color}`" shape="circle" size="large" :title="fabState.label">
      <IcloudSyncFabWave v-if="showProgress" :percent="fabState.percent" :tone="fabState.color" :size="46" />
      <IconifyIcon v-else :icon="iconName" :class="{ breathing: fabState.breathing }" width="28" height="28" />
    </a-button>
  </div>

  <a-drawer
    v-model:open="drawerOpen"
    title="iCloud 下载"
    placement="right"
    :width="1024"
    class="icloud-sync-drawer"
    :keyboard="!previewOpen"
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

        <div class="cloud-grid-wrap">
          <div v-if="loadingCloud" class="cloud-grid-loading" aria-busy="true">
            <a-spin />
          </div>
          <div ref="cloudGridScrollRef" class="cloud-grid-scroll">
            <div v-if="cloudRows.length" class="cloud-grid">
              <div
                v-for="row in cloudRows"
                :key="row.rowKey"
                class="cloud-cell"
                :class="{ selected: isCloudRowSelected(row) }"
                :title="`${row.displayFilename}\n${formatSortKeyTime(row.captureAt ?? row.sortKey)} · ${row.displayStateLabel}`"
                @click="openCloudPreview(row)"
              >
                <IcloudLazyImg
                  :asset-id="row.assetId"
                  :local-path="cloudRowLocalImagePath(row)"
                  :scroll-root="cloudGridScrollRef"
                  :kind="row.mediaKind === 'video' ? 'video' : row.mediaKind === 'live' ? 'livephoto' : 'image'"
                  :ext="row.displayFilename?.split('.').pop()"
                />
                <span class="cell-state" :style="{ background: row.displayStateColor || '#999' }">{{ row.displayStateLabel }}</span>
                <label v-if="canSelectCloudRow(row)" class="cell-check" @click.stop>
                  <a-checkbox :checked="isCloudRowSelected(row)" @change="toggleCloudRowSelect(row)" />
                </label>
              </div>
            </div>
            <a-empty v-else-if="!loadingCloud" description="当前筛选下暂无内容" :image="false" />
            <!-- 无限滚动哨兵：触底自动加载下一页 -->
            <div v-if="cloudRows.length" ref="cloudSentinelRef" class="cloud-grid-sentinel">
              <a-spin v-if="cloudLoadingMore" />
            </div>
          </div>
          <div class="cloud-grid-foot">
            <span v-if="cloudTotal > 0" class="cloud-grid-count">
              {{ cloudSelectedKeys.length ? `共 ${cloudTotal} 条，已选 ${cloudSelectedKeys.length} 项` : `共 ${cloudTotal} 条` }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </a-drawer>

  <MediaLightboxShell
    :open="previewOpen"
    :title="previewTitle"
    :meta="previewMeta"
    :can-prev="previewIndex > 0"
    :can-next="previewIndex >= 0 && previewIndex < cloudRows.length - 1"
    @close="closeCloudPreview"
    @prev="navCloudPreview(-1)"
    @next="navCloudPreview(1)"
  >
    <BaseImage v-if="previewSrc" class="viewer-media viewer-img" :src="previewSrc" fit="contain" width="100%" max-height="100%" :lazy="false" />
    <a-empty v-else description="无法加载预览" :image="false" />
  </MediaLightboxShell>
</template>

<style scoped lang="scss">
.fab-root {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  cursor: grab;
  &.is-dragging {
    cursor: grabbing;
    .fab-btn {
      transition: none;
      transform: none;
    }
  }
}
.fab-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  cursor: inherit;
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
  background: rgba(255, 255, 255, 0.45);
  pointer-events: none;
}
.cloud-grid-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 2px 8px;
}
.cloud-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}
.cloud-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: zoom-in;
  background: var(--color-fill-quaternary, rgba(0, 0, 0, 0.04));
  &.selected {
    border-color: var(--color-primary);
  }
}
.cell-state {
  position: absolute;
  left: 4px;
  bottom: 4px;
  max-width: calc(100% - 28px);
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}
.cell-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}
.cell-check {
  position: absolute;
  top: 4px;
  right: 4px;
  margin: 0;
  line-height: 1;
  padding: 2px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.85);
}
.cloud-grid-sentinel {
  flex-shrink: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
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

<style lang="scss">
/* 抽屉 body 撑满视口，表格区 flex 滚动 */
.icloud-sync-drawer.ant-drawer .ant-drawer-body {
  display: flex;
  flex-direction: column;
}
</style>
