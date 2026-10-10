<!--
  QQ 空间同步浮动入口（第二备份源）
  职责：扫码登录、左相册/右缩略图；意图先行（批量下载/移除）；忙时底栏；FAB 进度
  主流程：hydrate → FAB → 工具栏（全部下载 / 批量下载 / 批量移除）→ 宫格；
  意图：点功能 → 筛态 → 勾选/框选 → 再点执行；成功不自动退出；其它意图按钮禁用须先取消
  保留：下载本相册 / 上传到本相册（QQ 产品差异）
  @note 同步抽屉不提供灯箱（非大图且无完整视频能力）；预览请用本地相册
-->
<script setup lang="ts">
import {
  cancelQzoneSyncJob,
  getQzoneAuthState,
  getQzoneJobStatus,
  isQzoneAuthExpiredError,
  getQzoneAlbumCloudStates,
  listQzoneAlbums,
  listQzonePhotos,
  logoutQzone,
  pauseQzoneSyncJob,
  pollQzoneQrLogin,
  resumeQzoneSyncJob,
  startQzoneQrLogin,
  startQzoneSyncJob,
  uploadQzonePhotos,
  type QzoneAlbumSummary,
  type QzoneDeletePhotoItem,
  type QzoneJobSnapshot,
  type QzonePhotoView,
  type QzoneQrStatus
} from "@/api/qzoneSync";
import IcloudSyncFabWave from "./IcloudSyncFabWave.vue";
import ProtocolLazyThumb from "./ProtocolLazyThumb.vue";
import QzoneSyncDeleteDialog from "./QzoneSyncDeleteDialog.vue";
import QzoneSyncFooter from "./QzoneSyncFooter.vue";
import SyncFabShell from "./SyncFabShell.vue";
import { hitTestMarqueeKeys, MIN_MARQUEE_PX, useMarqueeDrag } from "../useMarqueeDrag";
import { cloudStateLabel, cloudStateTagColor } from "@/utils/icloudSyncCloudList";
import $feedback from "@/utils/feedback";
import { isTauri } from "@/utils/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useThrottleFn } from "@vueuse/core";
import dayjs from "dayjs";

defineOptions({ name: "AlbumQzoneSyncFab" });

const UNKNOWN_DAY = "__unknown__";

/** 意图先行：null=混排浏览；download/delete=筛态勾选 */
type CloudIntent = null | "download" | "delete";

const TASK_BUSY_HINT = "有任务进行中，请取消或等待结束后再操作";

const drawerOpen = ref(false);
const loggedIn = ref(false);
const uin = ref("");

const qrImage = ref("");
const qrLoading = ref(false);
const qrStatus = ref<QzoneQrStatus | "idle">("idle");
const qrMessage = ref("");
let qrPollTimer: ReturnType<typeof setInterval> | undefined;

const albums = ref<QzoneAlbumSummary[]>([]);
const albumsLoading = ref(false);
const refreshingCatalog = ref(false);
const albumPaneRef = ref<HTMLElement | null>(null);
const activeAlbumId = ref("");
const photos = ref<QzonePhotoView[]>([]);
const photosLoading = ref(false);
const photoScrollRef = ref<HTMLElement | null>(null);

const intent = ref<CloudIntent>(null);
const selectMode = computed(() => intent.value != null);
const selectedIds = ref<Set<string>>(new Set());
const deletingCloud = ref(false);
const deleteDialogOpen = ref(false);
const deleteDialogItems = ref<QzoneDeletePhotoItem[]>([]);
const uploadingAlbum = ref(false);
const starting = ref(false);
const pausing = ref(false);
const resuming = ref(false);
const cancelling = ref(false);

const job = ref<QzoneJobSnapshot>({
  status: "idle",
  done: 0,
  total: 0,
  message: "",
  updated: 0,
  skipped: 0,
  failed: 0
});

const busy = computed(() => ["cataloging", "downloading", "paused"].includes(job.value.status));
const canManageCloudSpace = computed(() => !busy.value);
const percent = computed(() => {
  if (job.value.total <= 0) return 0;
  return Math.min(100, Math.round((job.value.done / job.value.total) * 100));
});

/** 忙时或失败时展示底栏（对齐 iCloud：done/idle 不挂） */
const showSyncFooter = computed(() => busy.value || job.value.status === "failed" || starting.value);

const activeAlbum = computed(() => albums.value.find(a => a.topicId === activeAlbumId.value));
const selectedCount = computed(() => selectedIds.value.size);

/** 归一四态；缺省按 downloaded 兼容旧数据 */
function photoCloudState(photo: QzonePhotoView): string {
  const raw = (photo.cloudState || "").trim();
  if (raw) return raw;
  return photo.downloaded ? "synced" : "cloud_only";
}

/** 意图下筛态：对齐 iCloud — 下载=待下载|失败；移除=已下载；空闲=全部 */
const displayPhotos = computed(() => {
  if (intent.value === "download") {
    return photos.value.filter(p => {
      const s = photoCloudState(p);
      return s === "cloud_only" || s === "download_failed";
    });
  }
  if (intent.value === "delete") return photos.value.filter(p => photoCloudState(p) === "synced");
  return photos.value;
});

const downloadIntentLabel = computed(() => (intent.value === "download" ? `批量下载 (${selectedCount.value})` : "批量下载"));
const deleteIntentLabel = computed(() => (intent.value === "delete" ? `批量移除 (${selectedCount.value})` : "批量移除"));

function isSelected(assetId: string) {
  return selectedIds.value.has(assetId);
}

/** 仅按意图+云态判断可勾（不含忙时护栏；进度刷新剪勾选时用） */
function isSelectableInIntent(photo: QzonePhotoView): boolean {
  if (!intent.value) return false;
  const s = photoCloudState(photo);
  if (intent.value === "delete") return s === "synced";
  // 下载意图：待下载 / 失败可勾；下载中不可勾
  return s === "cloud_only" || s === "download_failed";
}

function canSelectPhoto(photo: QzonePhotoView): boolean {
  if (!canManageCloudSpace.value) return false;
  return isSelectableInIntent(photo);
}

function photoStateLabel(photo: QzonePhotoView): string {
  return cloudStateLabel(photoCloudState(photo));
}

function photoStateTagColor(photo: QzonePhotoView): string {
  return cloudStateTagColor(photoCloudState(photo));
}

function toggleSelect(assetId: string) {
  const next = new Set(selectedIds.value);
  if (next.has(assetId)) next.delete(assetId);
  else next.add(assetId);
  selectedIds.value = next;
}

function clearSelection() {
  selectedIds.value = new Set();
}

function exitIntent() {
  intent.value = null;
  clearSelection();
}

function removeSelectionKeys(keys: string[]) {
  if (keys.length === 0) return;
  const drop = new Set(keys);
  const next = new Set(selectedIds.value);
  for (const k of drop) next.delete(k);
  selectedIds.value = next;
}

function guardCloudManageAction(): boolean {
  if (canManageCloudSpace.value) return true;
  $feedback.message.warning(TASK_BUSY_HINT);
  return false;
}

/**
 * 进入意图：仅空闲可进；已在其它意图时须先取消（禁止直接切换）
 */
function enterIntent(next: "download" | "delete"): boolean {
  if (!guardCloudManageAction()) return false;
  if (intent.value === next) return true;
  if (intent.value != null) return false;
  clearSelection();
  intent.value = next;
  return true;
}

/** 意图内点格勾选；空闲不预览（同步抽屉灯箱已去掉） */
function onCellClick(row: { photo: QzonePhotoView }) {
  if (!intent.value) return;
  if (!canSelectPhoto(row.photo)) {
    const s = photoCloudState(row.photo);
    if (intent.value === "delete") {
      $feedback.message.info("仅已下载到本地的项可勾选移除");
    } else if (s === "downloading") {
      $feedback.message.info("下载中的项不可勾选");
    } else {
      $feedback.message.info("仅待下载或失败项可勾选下载");
    }
    return;
  }
  toggleSelect(row.photo.assetId);
}

const photoFrameRef = ref<HTMLElement | null>(null);
let qzoneSelectSnapshot: Set<string> | null = null;

const {
  marqueeStyle: qzoneMarqueeStyle,
  marqueeActive: qzoneMarqueeActive,
  onPointerDown: onQzoneMarqueePointerDown,
  onDragStart: onQzoneDragStart
} = useMarqueeDrag({
  onBegin() {
    qzoneSelectSnapshot = new Set(selectedIds.value);
  },
  onUpdate(box) {
    const frame = photoFrameRef.value;
    if (!frame) return;
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      if (qzoneSelectSnapshot) selectedIds.value = new Set(qzoneSelectSnapshot);
      return;
    }
    const next = new Set(qzoneSelectSnapshot ?? []);
    const want = new Set(hitTestMarqueeKeys(frame, box));
    for (const photo of displayPhotos.value) {
      if (!want.has(photo.assetId) || !canSelectPhoto(photo)) continue;
      next.add(photo.assetId);
    }
    selectedIds.value = next;
  },
  onEnd(committed) {
    if (!committed && qzoneSelectSnapshot) selectedIds.value = new Set(qzoneSelectSnapshot);
    qzoneSelectSnapshot = null;
  }
});

function onPhotoPointerDown(event: PointerEvent) {
  if (!canManageCloudSpace.value || !intent.value) return;
  const scroll = photoScrollRef.value;
  const frame = photoFrameRef.value;
  if (!scroll || !frame) return;
  onQzoneMarqueePointerDown(event, { scrollEl: scroll, frameEl: frame });
}

/** 意图先行：下载 — 首次进入筛选；再次点击执行子集入队 */
async function onDownloadIntentClick() {
  if (!guardCloudManageAction()) return;
  if (intent.value !== "download") {
    enterIntent("download");
    return;
  }
  if (selectedCount.value === 0) {
    $feedback.message.warning("请先勾选要下载的照片");
    return;
  }
  if (!activeAlbumId.value) {
    $feedback.message.warning("请先选择相册");
    return;
  }
  const picked = displayPhotos.value.filter(p => selectedIds.value.has(p.assetId) && isSelectableInIntent(p));
  if (!picked.length) {
    $feedback.message.warning("请先勾选要下载的照片");
    return;
  }
  starting.value = true;
  try {
    const ids = picked.map(p => p.assetId);
    job.value = await startQzoneSyncJob({ albumId: activeAlbumId.value, assetIds: ids });
    removeSelectionKeys(ids);
    $feedback.message.success(`已开始下载所选 ${ids.length} 项`);
  } catch (e) {
    await handleQzoneApiError(e, "启动失败");
  } finally {
    starting.value = false;
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

const CLOUD_DELETE_HINT = "只删除 QQ 空间云端副本，电脑里已下载的文件会保留。删除后通常无法在空间回收站恢复，请确认后再继续。";

function confirmDeleteCloud() {
  if (!guardCloudManageAction()) return;
  const album = activeAlbum.value;
  const albumId = activeAlbumId.value;
  if (!albumId) return;
  const picked = displayPhotos.value.filter(p => selectedIds.value.has(p.assetId) && photoCloudState(p) === "synced");
  if (!picked.length) {
    $feedback.message.warning("请先勾选要从 QQ 空间移除的照片（须已下载到本地）");
    return;
  }

  void (async () => {
    try {
      await $feedback.confirm(CLOUD_DELETE_HINT, {
        title: `从 QQ 空间移除所选 ${picked.length} 项？`,
        okText: "确认从 QQ 空间移除",
        cooldownMs: 1500
      });
    } catch {
      return;
    }
    if (deletingCloud.value) return;
    deletingCloud.value = true;
    deleteDialogItems.value = picked.map(p => ({
      albumId: p.albumId || albumId,
      assetId: p.assetId,
      sloc: p.sloc || p.assetId,
      albumPriv: album?.albumPriv ?? 1
    }));
    deleteDialogOpen.value = true;
  })();
}

/** 删云结束：只保留失败项勾选，刷新列表；不退出意图 */
async function onCloudDeleteFinished(keepAssetIds: string[]) {
  const keep = new Set(keepAssetIds);
  selectedIds.value = new Set([...selectedIds.value].filter(id => keep.has(id)));
  try {
    await loadAlbums();
  } finally {
    deletingCloud.value = false;
  }
}

/** 按日分组；基于意图筛后的 displayPhotos */
const photoGroups = computed(() => {
  type Row = { photo: QzonePhotoView };
  const buckets = new Map<string, { key: string; label: string; sort: number; items: Row[] }>();
  displayPhotos.value.forEach(photo => {
    const parsed = parseCaptureDay(photo.captureAt);
    const key = parsed?.key ?? UNKNOWN_DAY;
    const label = parsed?.label ?? "未知时间";
    const sort = parsed?.sort ?? -1;
    let g = buckets.get(key);
    if (!g) {
      g = { key, label, sort, items: [] };
      buckets.set(key, g);
    }
    g.items.push({ photo });
  });
  return [...buckets.values()].sort((a, b) => b.sort - a.sort);
});

function parseCaptureDay(raw?: string | null): { key: string; label: string; sort: number } | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  let d = dayjs(s);
  if (!d.isValid() && /^\d+$/.test(s)) {
    const n = Number(s);
    d = dayjs(n > 1e12 ? n : n * 1000);
  }
  if (!d.isValid()) return null;
  const key = d.format("YYYY-MM-DD");
  return { key, label: d.format("YYYY年M月D日"), sort: d.startOf("day").valueOf() };
}

async function refreshAuth() {
  const s = await getQzoneAuthState();
  loggedIn.value = !!s.loggedIn;
  uin.value = s.uin || "";
}

async function refreshJob() {
  job.value = await getQzoneJobStatus();
}

let applyingAuthExpired = false;
async function applyAuthExpiredUi(showToast = true) {
  if (applyingAuthExpired) return;
  applyingAuthExpired = true;
  try {
    try {
      await logoutQzone();
    } catch {
      /* session 可能已清 */
    }
    loggedIn.value = false;
    uin.value = "";
    albums.value = [];
    photos.value = [];
    activeAlbumId.value = "";
    exitIntent();
    try {
      await refreshJob();
    } catch {
      /* ignore */
    }
    if (drawerOpen.value) void refreshQr();
    if (showToast) {
      $feedback.message.warning("QQ 空间登录已失效，请重新扫码登录");
    }
  } finally {
    applyingAuthExpired = false;
  }
}

async function handleQzoneApiError(e: unknown, fallback: string) {
  if (isQzoneAuthExpiredError(e)) {
    await applyAuthExpiredUi(true);
    return;
  }
  $feedback.message.error(e instanceof Error ? e.message : String(e) || fallback);
}

async function loadAlbums() {
  albumsLoading.value = true;
  try {
    albums.value = await listQzoneAlbums();
    if (!activeAlbumId.value && albums.value.length) {
      await selectAlbum(albums.value[0].topicId);
    } else if (activeAlbumId.value && !albums.value.some(a => a.topicId === activeAlbumId.value)) {
      activeAlbumId.value = "";
      photos.value = [];
      if (albums.value.length) await selectAlbum(albums.value[0].topicId);
    } else if (activeAlbumId.value) {
      await selectAlbum(activeAlbumId.value, true);
    }
  } catch (e) {
    await handleQzoneApiError(e, "拉取相册失败");
  } finally {
    albumsLoading.value = false;
  }
}

async function onRefreshCatalog() {
  if (!loggedIn.value || refreshingCatalog.value) return;
  if (!guardCloudManageAction()) return;
  refreshingCatalog.value = true;
  try {
    await loadAlbums();
    $feedback.message.success("目录已刷新");
  } finally {
    refreshingCatalog.value = false;
  }
}

async function selectAlbum(topicId: string, force = false) {
  if (!topicId) return;
  if (!force && activeAlbumId.value === topicId && photos.value.length) return;
  // 不支持跨相册勾选：换册退出意图；同册强制刷新保留意图（删云/下载后）
  if (activeAlbumId.value !== topicId) exitIntent();
  activeAlbumId.value = topicId;
  photosLoading.value = true;
  photos.value = [];
  try {
    photos.value = await listQzonePhotos(topicId);
    // 刷新后剪掉已不在当前筛态的勾选（勿用 canSelectPhoto：忙时会误清）
    if (intent.value && selectedIds.value.size) {
      selectedIds.value = new Set(
        [...selectedIds.value].filter(id => {
          const p = photos.value.find(x => x.assetId === id);
          return !!p && isSelectableInIntent(p);
        })
      );
    }
  } catch (e) {
    await handleQzoneApiError(e, "拉取相片失败");
  } finally {
    photosLoading.value = false;
  }
}

function stopQrPoll() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = undefined;
  }
}

async function refreshQr() {
  if (!isTauri()) return;
  qrLoading.value = true;
  qrMessage.value = "";
  qrStatus.value = "idle";
  stopQrPoll();
  try {
    const start = await startQzoneQrLogin();
    qrImage.value = start.imageDataUrl;
    qrStatus.value = "waiting";
    qrMessage.value = "请使用手机 QQ 扫码登录";
    qrPollTimer = setInterval(() => {
      void tickQrPoll();
    }, 2000);
  } catch (e) {
    qrImage.value = "";
    qrStatus.value = "error";
    qrMessage.value = e instanceof Error ? e.message : String(e) || "获取二维码失败";
  } finally {
    qrLoading.value = false;
  }
}

async function tickQrPoll() {
  try {
    const r = await pollQzoneQrLogin();
    qrStatus.value = r.status;
    qrMessage.value = r.message;
    if (r.status === "success") {
      stopQrPoll();
      loggedIn.value = true;
      uin.value = r.auth?.uin || "";
      $feedback.message.success(r.message || `已登录 QQ ${uin.value}`);
      void loadAlbums();
    } else if (r.status === "expired" || r.status === "error") {
      stopQrPoll();
      if (r.message.includes("p_skey")) {
        window.setTimeout(() => {
          void refreshQr();
        }, 800);
      }
    }
  } catch (e) {
    stopQrPoll();
    qrStatus.value = "error";
    qrMessage.value = e instanceof Error ? e.message : String(e) || "轮询失败";
  }
}

async function onLogout() {
  try {
    await logoutQzone();
    loggedIn.value = false;
    uin.value = "";
    albums.value = [];
    photos.value = [];
    activeAlbumId.value = "";
    exitIntent();
    await refreshJob();
    if (drawerOpen.value) void refreshQr();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "退出失败");
  }
}

async function onSyncAll() {
  if (!guardCloudManageAction()) return;
  starting.value = true;
  try {
    job.value = await startQzoneSyncJob();
    $feedback.message.success("已开始全部下载");
  } catch (e) {
    await handleQzoneApiError(e, "启动失败");
  } finally {
    starting.value = false;
  }
}

async function onSyncAlbum() {
  if (!guardCloudManageAction()) return;
  if (!activeAlbumId.value) {
    $feedback.message.warning("请先选择相册");
    return;
  }
  starting.value = true;
  try {
    job.value = await startQzoneSyncJob({ albumId: activeAlbumId.value });
    $feedback.message.success(`已开始下载：${activeAlbum.value?.name || "本相册"}`);
  } catch (e) {
    await handleQzoneApiError(e, "启动失败");
  } finally {
    starting.value = false;
  }
}

async function onUploadToAlbum() {
  if (!isTauri() || uploadingAlbum.value || busy.value) return;
  const albumId = activeAlbumId.value;
  if (!albumId) {
    $feedback.message.warning("请先选择相册");
    return;
  }
  let selected: string | string[] | null;
  try {
    selected = await open({
      multiple: true,
      title: `上传到「${activeAlbum.value?.name || "本相册"}」`,
      filters: [
        {
          name: "图片 / 视频",
          extensions: ["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif", "mp4", "mov", "m4v"]
        }
      ]
    });
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "打开文件框失败");
    return;
  }
  if (selected == null) return;
  const paths = (Array.isArray(selected) ? selected : [selected]).map(String).filter(Boolean);
  if (!paths.length) return;

  uploadingAlbum.value = true;
  try {
    const result = await uploadQzonePhotos(albumId, paths);
    if (result.uploaded > 0) {
      $feedback.message.success(result.message);
      await selectAlbum(albumId, true);
      try {
        albums.value = await listQzoneAlbums();
      } catch {
        /* ignore */
      }
    } else {
      $feedback.message.error(result.message || "上传失败");
    }
  } catch (e) {
    await handleQzoneApiError(e, "上传失败");
  } finally {
    uploadingAlbum.value = false;
  }
}

async function onPause() {
  pausing.value = true;
  try {
    job.value = await pauseQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "暂停失败");
  } finally {
    pausing.value = false;
  }
}

async function onResume() {
  resuming.value = true;
  try {
    job.value = await resumeQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "继续失败");
  } finally {
    resuming.value = false;
  }
}

async function onCancel() {
  try {
    await $feedback.confirm("将丢弃当前下载进度", {
      title: "取消任务？",
      okText: "取消任务"
    });
  } catch {
    return;
  }
  cancelling.value = true;
  try {
    job.value = await cancelQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "取消失败");
  } finally {
    cancelling.value = false;
  }
}

/** FAB：下载中水波进度；其余按任务态图标 */
const fabState = computed(() => {
  const status = job.value.status;
  const p = percent.value;
  if (status === "downloading" || status === "cataloging") {
    return { icon: "cloud" as const, color: "processing" as const, label: statusHeadlineForFab(status), percent: p, breathing: false };
  }
  if (status === "paused") {
    return { icon: "pause" as const, color: "warning" as const, label: "已暂停", percent: p, breathing: false };
  }
  if (status === "failed") {
    return { icon: "warning" as const, color: "error" as const, label: "同步失败", percent: 0, breathing: false };
  }
  if (status === "done") {
    return { icon: "check" as const, color: "success" as const, label: "本轮已完成", percent: 100, breathing: false };
  }
  return { icon: "qq" as const, color: "default" as const, label: "QQ 空间同步", percent: 0, breathing: false };
});

function statusHeadlineForFab(status: string) {
  return status === "cataloging" ? "正在枚举相册…" : "正在下载到本地";
}

const showFabProgress = computed(
  () => fabState.value.percent > 0 && fabState.value.percent < 100 && (job.value.status === "downloading" || job.value.status === "cataloging")
);

const fabIconName = computed(() => {
  switch (fabState.value.icon) {
    case "check":
      return "mdi:check-circle";
    case "warning":
      return "mdi:alert-circle";
    case "pause":
      return "mdi:pause-circle";
    case "cloud":
      return "mdi:cloud-outline";
    default:
      return "ri:qq-fill";
  }
});

/**
 * 就地合并四态到现有宫格行（不清 photos、不打 QQ 网）
 * @note 进度回写专用；整表重拉会空白闪一下
 */
async function patchPhotosCloudStates() {
  const albumId = activeAlbumId.value;
  if (!albumId || !photos.value.length) return;
  try {
    const states = await getQzoneAlbumCloudStates(albumId);
    let changed = false;
    const next = photos.value.map(p => {
      const state = states[p.assetId] || p.cloudState || (p.downloaded ? "synced" : "cloud_only");
      const downloaded = state === "synced";
      if (p.cloudState === state && p.downloaded === downloaded) return p;
      changed = true;
      return { ...p, cloudState: state, downloaded };
    });
    if (changed) photos.value = next;
    // 意图内勾选：剪掉已不可选（如刚变成 downloading / synced）
    if (intent.value && selectedIds.value.size) {
      selectedIds.value = new Set(
        [...selectedIds.value].filter(id => {
          const p = photos.value.find(x => x.assetId === id);
          return !!p && isSelectableInIntent(p);
        })
      );
    }
  } catch {
    /* 进度回写失败不打扰浏览 */
  }
}

/** 下载进度驱动宫格角标就地更新（节流） */
const throttledPatchPhotosOnProgress = useThrottleFn(() => {
  if (drawerOpen.value && loggedIn.value && activeAlbumId.value) {
    void patchPhotosCloudStates();
  }
}, 800, true, true);

let unlisten: UnlistenFn | undefined;
let unlistenAuthExpired: UnlistenFn | undefined;

onMounted(async () => {
  if (!isTauri()) return;
  try {
    await refreshAuth();
    await refreshJob();
    unlisten = await listen<QzoneJobSnapshot>("qzone-sync://progress", ev => {
      const prev = job.value.status;
      job.value = ev.payload;
      const wasActive = prev === "cataloging" || prev === "downloading" || prev === "paused";
      if (wasActive && ev.payload.status === "done") {
        const n = ev.payload.updated ?? 0;
        if (n > 0) {
          $feedback.message.info(`有 ${n} 张新照片已下载到本地，点击「刷新」可在相册中查看`);
        }
      }
      // 进度/终态一律就地 patch，禁止 selectAlbum 整表清空
      if (drawerOpen.value && loggedIn.value && activeAlbumId.value) {
        if (ev.payload.status === "downloading" || ev.payload.status === "cataloging") {
          throttledPatchPhotosOnProgress();
        } else if (wasActive && (ev.payload.status === "done" || ev.payload.status === "failed" || ev.payload.status === "idle" || ev.payload.status === "paused")) {
          void patchPhotosCloudStates();
        }
      }
    });
    unlistenAuthExpired = await listen("qzone-sync://auth-expired", () => {
      void applyAuthExpiredUi(true);
    });
  } catch {
    /* Web 预览无 invoke */
  }
});

onBeforeUnmount(() => {
  stopQrPoll();
  unlisten?.();
  unlistenAuthExpired?.();
});

watch(drawerOpen, open => {
  if (!isTauri()) return;
  if (open) {
    // 关抽屉再开：保留已加载相册/宫格，不重拉；仅未登录或首开无数据时取数
    if (loggedIn.value) {
      if (!albums.value.length) void loadAlbums();
    } else {
      void refreshAuth().then(() => {
        if (!loggedIn.value) void refreshQr();
        else void loadAlbums();
      });
    }
    void refreshJob();
  } else {
    stopQrPoll();
    if (intent.value) exitIntent();
  }
});
</script>

<template>
  <SyncFabShell
    v-model:drawer-open="drawerOpen"
    storage-key="album.qzoneSyncFab.pos"
    default-edge="left"
    drawer-title="QQ 空间同步"
    drawer-class="qzone-sync-drawer"
  >
    <template #fab>
      <a-button class="fab-btn" :class="`fab-${fabState.color}`" shape="circle" size="large" :title="fabState.label">
        <IcloudSyncFabWave v-if="showFabProgress" :percent="fabState.percent" :tone="fabState.color" :size="46" />
        <CcIconifyIcon v-else :icon="fabIconName" :class="{ breathing: fabState.breathing }" width="28" height="28" />
      </a-button>
    </template>

    <template #drawer-extra>
      <a-space v-if="loggedIn" :size="8" align="center">
        <div class="drawer-extra-tag">
          QQ <span>{{ uin || "—" }}</span>
        </div>
        <a-button type="link" size="small" danger @click="onLogout">退出</a-button>
      </a-space>
    </template>

    <div v-if="!loggedIn" class="login-block">
      <div class="qr-wrap">
        <a-spin :spinning="qrLoading">
          <img v-if="qrImage" :src="qrImage" class="qr-img" alt="QQ 空间登录二维码" />
          <div v-else class="qr-placeholder">{{ qrMessage || "正在获取二维码…" }}</div>
        </a-spin>
      </div>
      <p class="qr-status" :class="qrStatus">{{ qrMessage }}</p>
      <a-button class="mt" :loading="qrLoading" @click="refreshQr">刷新二维码</a-button>
    </div>

    <div v-else class="browser">
      <div class="cloud-toolbar">
        <div class="toolbar-actions">
          <div class="toolbar-left">
            <a-tooltip v-bind="canManageCloudSpace ? { title: '下载全部相册待同步项' } : { title: TASK_BUSY_HINT }" placement="bottom">
              <a-button type="primary" :loading="starting && !intent" :disabled="!canManageCloudSpace" @click="onSyncAll">全部下载</a-button>
            </a-tooltip>
            <a-tooltip
              v-bind="
                !canManageCloudSpace
                  ? { title: TASK_BUSY_HINT }
                  : intent && intent !== 'download'
                    ? { title: '请先取消当前操作' }
                    : { title: '挑选未下载项后再下' }
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
                    : { title: '挑选已下载项后从 QQ 空间移除' }
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
              :loading="refreshingCatalog || albumsLoading"
              :disabled="!canManageCloudSpace"
              :title="canManageCloudSpace ? '刷新目录' : TASK_BUSY_HINT"
              @click="onRefreshCatalog"
            >
              <template #icon>
                <CcIconifyIcon icon="ant-design:reload-outlined" width="16px" height="16px" />
              </template>
            </a-button>
          </div>
        </div>
      </div>

      <div class="panes">
        <aside ref="albumPaneRef" class="album-pane">
          <a-spin :spinning="albumsLoading">
            <div v-for="a in albums" :key="a.topicId" class="album-item" :class="{ active: a.topicId === activeAlbumId }" @click="selectAlbum(a.topicId)">
              <div class="cover">
                <ProtocolLazyThumb v-if="a.coverUrl" protocol="qzoneimg" :remote-url="a.coverUrl" :scroll-root="albumPaneRef" qzone-kind="thumb" />
                <div v-else class="cover-ph">{{ a.name.slice(0, 1) }}</div>
              </div>
              <div class="meta">
                <div class="name" :title="a.name">{{ a.name }}</div>
                <div class="count">{{ a.total }} 项</div>
              </div>
            </div>
            <a-empty v-if="!albumsLoading && !albums.length" description="暂无相册" :image="false" />
          </a-spin>
        </aside>

        <section class="photo-pane">
          <div class="photo-head">
            <div class="photo-head-main">
              <span class="photo-head-title">{{ activeAlbum?.name || "请选择相册" }}</span>
              <span v-if="displayPhotos.length || photos.length" class="sub">
                <template v-if="selectMode && selectedCount">已选 {{ selectedCount }} · </template>
                显示 {{ displayPhotos.length }}
                <template v-if="intent"> / 本册 {{ photos.length }}</template>
                <template v-else-if="activeAlbum && activeAlbum.total > 0 && photos.length !== activeAlbum.total">
                  · 云端申报 {{ activeAlbum.total }}
                </template>
              </span>
            </div>
            <div class="photo-head-actions">
              <a-button size="small" type="primary" :disabled="busy || !activeAlbumId || uploadingAlbum || !!intent" @click="onSyncAlbum">
                下载本相册
              </a-button>
              <a-button size="small" :loading="uploadingAlbum" :disabled="busy || !activeAlbumId || uploadingAlbum || !!intent" @click="onUploadToAlbum">
                上传到本相册
              </a-button>
            </div>
          </div>
          <div
            ref="photoScrollRef"
            class="photo-scroll"
            :class="{ 'is-marquee': qzoneMarqueeActive }"
            @pointerdown="onPhotoPointerDown"
            @dragstart="onQzoneDragStart"
          >
            <a-spin :spinning="photosLoading">
              <div v-if="photoGroups.length" ref="photoFrameRef" class="timeline">
                <section v-for="g in photoGroups" :key="g.key" class="day-group">
                  <h4 class="day-label">{{ g.label }}</h4>
                  <div class="grid">
                    <button
                      v-for="row in g.items"
                      :key="row.photo.assetId"
                      type="button"
                      class="cell"
                      :data-asset-id="row.photo.assetId"
                      :data-marquee-key="canSelectPhoto(row.photo) ? row.photo.assetId : undefined"
                      :class="{ selected: selectMode && isSelected(row.photo.assetId), 'select-mode': selectMode }"
                      :title="row.photo.name"
                      @click="onCellClick(row)"
                    >
                      <ProtocolLazyThumb
                        v-if="row.photo.thumbUrl"
                        protocol="qzoneimg"
                        :remote-url="row.photo.thumbUrl"
                        :scroll-root="photoScrollRef"
                        qzone-kind="thumb"
                        :kind="row.photo.mediaKind === 'video' ? 'video' : 'image'"
                        :ext="row.photo.name?.split('.').pop()"
                      />
                      <div v-else class="cell-ph" />
                      <a-tag class="cell-state" :color="photoStateTagColor(row.photo)" :bordered="false">
                        {{ photoStateLabel(row.photo) }}
                      </a-tag>
                    </button>
                  </div>
                </section>
                <div v-if="qzoneMarqueeStyle" class="sync-marquee" :style="qzoneMarqueeStyle" />
              </div>
              <a-empty
                v-else-if="!photosLoading && activeAlbumId"
                :description="intent ? (intent === 'download' ? '当前相册没有待下载项' : '当前相册没有已下载项') : '此相册暂无内容'"
                :image="false"
              />
            </a-spin>
          </div>
        </section>
      </div>

      <QzoneSyncFooter
        v-if="showSyncFooter"
        :job="job"
        :pausing="pausing"
        :resuming="resuming"
        :cancelling="cancelling"
        @pause="onPause"
        @resume="onResume"
        @cancel="onCancel"
      />
    </div>
  </SyncFabShell>
  <QzoneSyncDeleteDialog
    v-model:open="deleteDialogOpen"
    :items="deleteDialogItems"
    @finished="onCloudDeleteFinished"
    @auth-expired="applyAuthExpiredUi(true)"
  />
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

.login-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.drawer-extra-tag {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding: 0 4px;
  span {
    color: var(--color-primary);
  }
}
.mt {
  margin-top: 12px;
}
.qr-wrap {
  display: flex;
  justify-content: center;
  min-height: 180px;
  margin: 8px 0;
}
.qr-img {
  width: 180px;
  height: 180px;
  display: block;
  border-radius: 8px;
  background: var(--color-bg-spotlight-light);
}
.qr-placeholder {
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
  color: var(--color-text-tertiary);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
}
.qr-status {
  text-align: center;
  margin: 0;
  color: var(--color-text-secondary);
  &.scanned {
    color: var(--color-primary);
  }
  &.success {
    color: var(--color-success);
  }
  &.error,
  &.expired {
    color: var(--color-error);
  }
}

.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
.panes {
  display: flex;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.album-pane {
  width: 220px;
  flex-shrink: 0;
  overflow: auto;
  border-right: 1px solid var(--border-color);
  padding: 8px;
}
.album-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-overlay-hover);
  }
  &.active {
    background: var(--color-primary-bg);
  }
}
.cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-color-secondary);
}
.cover-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-weight: 600;
}
.meta {
  min-width: 0;
}
.name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.count {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.photo-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.photo-head {
  padding: 10px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.photo-head-main {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}
.photo-head-title {
  font-weight: 600;
}
.photo-head .sub {
  font-weight: 400;
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.photo-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.photo-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 14px 14px;
  overscroll-behavior: contain;
  user-select: none;
  &.is-marquee {
    cursor: crosshair;
  }
}
.timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sync-marquee {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1px solid var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  pointer-events: none;
}
.day-group {
  min-width: 0;
}
.day-label {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 4px 0;
  background: linear-gradient(to bottom, var(--bg-color) 70%, transparent);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
  align-content: start;
}
.cell {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  cursor: default;
  background: var(--bg-color-secondary);
  /* 避免 button 继承 font-size:0 时角标文字不可见 */
  font-size: 12px;
  &.select-mode {
    cursor: pointer;
  }
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
.cell-ph {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, var(--color-fill-tertiary), var(--color-fill-secondary), var(--color-fill-tertiary));
  background-size: 200% 100%;
}
/* 左下角常驻；尺寸压小以适配宫格 */
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
</style>
