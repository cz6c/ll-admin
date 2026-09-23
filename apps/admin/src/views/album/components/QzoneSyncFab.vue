<!--
  QQ 空间同步浮动入口（第二备份源）
  职责：扫码登录、左相册/右缩略图浏览、MediaLightboxShell 灯箱、全部下载；
  本相册下载/上传；角标「已下载」+ 勾选后从 QQ 空间移除（本机文件保留）；左键拖拽框选复用相册宫格
  适用：相册页与 IcloudSyncFab 并列；交互结构参考开源客户端，不嵌入 GPL 源码
  @note 进度区对齐 IcloudSyncStatusCard：顶栏状态卡 + 进度条统计；账号放抽屉 #extra
-->
<script setup lang="ts">
import {
  cancelQzoneSyncJob,
  deleteQzonePhotos,
  getQzoneAuthState,
  getQzoneJobStatus,
  isQzoneAuthExpiredError,
  listQzoneAlbums,
  listQzonePhotos,
  logoutQzone,
  pauseQzoneSyncJob,
  pollQzoneQrLogin,
  prepareQzonePreview,
  qzoneProxiedSrc,
  resumeQzoneSyncJob,
  startQzoneQrLogin,
  startQzoneSyncJob,
  uploadQzonePhotos,
  type QzoneAlbumSummary,
  type QzoneJobSnapshot,
  type QzonePhotoView,
  type QzoneQrStatus
} from "@/api/qzoneSync";
import ProtocolLazyThumb from "./ProtocolLazyThumb.vue";
import SyncFabShell from "./SyncFabShell.vue";
import { hitTestMarqueeKeys, MIN_MARQUEE_PX, useMarqueeDrag } from "../useMarqueeDrag";
import $feedback from "@/utils/feedback";
import { isTauri } from "@/utils/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import dayjs from "dayjs";

defineOptions({ name: "AlbumQzoneSyncFab" });

const UNKNOWN_DAY = "__unknown__";

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

/** 勾选模式：点格切换选中，用于从 QQ 空间移除（本机保留） */
const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const deletingCloud = ref(false);
/** 上传到本相册进行中 */
const uploadingAlbum = ref(false);

const previewOpen = ref(false);
const previewIndex = ref(0);
const previewIsVideo = ref(false);
const previewLoading = ref(false);
/** 视频落盘后的 asset URL；图片仍走 qzoneProxiedSrc */
const previewVideoSrc = ref("");
let previewEpoch = 0;

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
const percent = computed(() => {
  if (job.value.total <= 0) return 0;
  return Math.min(100, Math.round((job.value.done / job.value.total) * 100));
});

const statusHeadline = computed(() => {
  switch (job.value.status) {
    case "cataloging":
      return "正在枚举相册…";
    case "downloading":
      return "正在下载到本地";
    case "paused":
      return "已暂停";
    case "failed":
      return "同步失败";
    case "done":
      return "本轮已完成";
    default:
      return "准备就绪";
  }
});

const statusDescription = computed(() => {
  if (job.value.message?.trim()) return job.value.message;
  if (!busy.value) return "可全部下载；本相册的下载/上传在右侧标题旁";
  return "";
});

const progressStatsText = computed(() => {
  const j = job.value;
  if (j.total <= 0) return "";
  return `${j.total} · 完成 ${j.done} · 新增 ${j.updated} · 跳过 ${j.skipped} · 失败 ${j.failed}`;
});

const showProgressBar = computed(() => busy.value || job.value.total > 0);

const activeAlbum = computed(() => albums.value.find(a => a.topicId === activeAlbumId.value));

const selectedCount = computed(() => selectedIds.value.size);

function isSelected(assetId: string) {
  return selectedIds.value.has(assetId);
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

function exitSelectMode() {
  selectMode.value = false;
  clearSelection();
}

function onCellClick(row: { photo: QzonePhotoView; index: number }) {
  if (selectMode.value) {
    toggleSelect(row.photo.assetId);
    return;
  }
  openPreview(row.index);
}

const photoFrameRef = ref<HTMLElement | null>(null);
/** 框选开始前的勾选；拖太短或取消时还原 */
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
    // 累加：本轮命中并入拖前快照，不清除框外已选项
    const next = new Set(qzoneSelectSnapshot ?? []);
    for (const key of hitTestMarqueeKeys(frame, box)) {
      next.add(key);
    }
    selectedIds.value = next;
    if (next.size > 0) selectMode.value = true;
  },
  onEnd(committed) {
    if (!committed && qzoneSelectSnapshot) selectedIds.value = new Set(qzoneSelectSnapshot);
    else if (committed && selectedIds.value.size > 0) selectMode.value = true;
    qzoneSelectSnapshot = null;
  }
});

function onPhotoPointerDown(event: PointerEvent) {
  if (busy.value) return;
  const scroll = photoScrollRef.value;
  const frame = photoFrameRef.value;
  if (!scroll || !frame) return;
  onQzoneMarqueePointerDown(event, { scrollEl: scroll, frameEl: frame });
}

/**
 * 从 QQ 空间移除勾选（本机文件保留）；全屏蒙层 + 删完刷新相册列表与当前相册
 */
async function onDeleteSelectedFromCloud() {
  if (!isTauri() || deletingCloud.value || selectedCount.value === 0) return;
  const album = activeAlbum.value;
  const albumId = activeAlbumId.value;
  if (!albumId) return;
  const picked = photos.value.filter(p => selectedIds.value.has(p.assetId));
  if (!picked.length) return;

  const CLOUD_DELETE_HINT = "只删除 QQ 空间云端副本，电脑里已下载的文件会保留。删除后通常无法在空间回收站恢复，请确认后再继续。";
  try {
    await $feedback.confirm(CLOUD_DELETE_HINT, {
      title: `确定从 QQ 空间移除所选 ${picked.length} 项？`,
      okText: "确认移除",
      cooldownMs: 1500
    });
  } catch {
    return;
  }

  deletingCloud.value = true;
  $feedback.loading("正在从 QQ 空间移除…");
  try {
    const result = await deleteQzonePhotos(
      picked.map(p => ({
        albumId: p.albumId || albumId,
        assetId: p.assetId,
        sloc: p.sloc || p.assetId,
        albumPriv: album?.albumPriv ?? 1
      }))
    );
    // 刷新左侧相册计数 + 当前相册相片（loadAlbums 内会 force select 当前册）
    await loadAlbums();
    $feedback.closeLoading();
    if (result.failed > 0 && result.deleted === 0) {
      $feedback.message.error(result.message || "移除失败");
    } else if (result.failed > 0) {
      $feedback.message.warning(result.message);
    } else {
      $feedback.message.success(result.message || `已移除 ${result.deleted} 项`);
    }
  } catch (e) {
    $feedback.closeLoading();
    await handleQzoneApiError(e, "移除失败");
  } finally {
    $feedback.closeLoading();
    deletingCloud.value = false;
  }
}

const previewImageSrc = computed(() => {
  if (previewIsVideo.value) return "";
  const photo = photos.value[previewIndex.value];
  if (!photo) return "";
  return qzoneProxiedSrc(photo.previewUrl || photo.thumbUrl, "preview");
});

const previewPhoto = computed(() => photos.value[previewIndex.value] ?? null);

const previewTitle = computed(() => previewPhoto.value?.name?.trim() || "预览");

const previewMeta = computed(() => {
  if (!previewOpen.value || !photos.value.length || previewIndex.value < 0) return "";
  const parts: string[] = [];
  const capture = formatQzoneCaptureAt(previewPhoto.value?.captureAt);
  if (capture) parts.push(capture);
  parts.push(`${previewIndex.value + 1} / ${photos.value.length}`);
  return parts.join(" · ");
});

/** 灯箱时间；与时间轴分组同一套数字时间戳兼容 */
function formatQzoneCaptureAt(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  let d = dayjs(s);
  if (!d.isValid() && /^\d+$/.test(s)) {
    const n = Number(s);
    d = dayjs(n > 1e12 ? n : n * 1000);
  }
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : null;
}

/** 按日分组时间轴；无时间归「未知时间」并沉底 */
const photoGroups = computed(() => {
  type Row = { photo: QzonePhotoView; index: number };
  const buckets = new Map<string, { key: string; label: string; sort: number; items: Row[] }>();
  photos.value.forEach((photo, index) => {
    const parsed = parseCaptureDay(photo.captureAt);
    const key = parsed?.key ?? UNKNOWN_DAY;
    const label = parsed?.label ?? "未知时间";
    const sort = parsed?.sort ?? -1;
    let g = buckets.get(key);
    if (!g) {
      g = { key, label, sort, items: [] };
      buckets.set(key, g);
    }
    g.items.push({ photo, index });
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

/**
 * 授权失效：清 UI 登录态（磁盘 session 多由 Rust 已清）；抽屉开着则回到扫码
 */
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
    exitSelectMode();
    closePreview();
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

/** API 错误：授权失效则退出登录，否则普通 toast */
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

/** 刷新远端相册目录与当前相册内容（不启动下载任务） */
async function onRefreshCatalog() {
  if (!loggedIn.value || refreshingCatalog.value) return;
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
  closePreview();
  // 不支持跨相册勾选：换册或强制刷新时退出勾选模式
  exitSelectMode();
  activeAlbumId.value = topicId;
  photosLoading.value = true;
  photos.value = [];
  try {
    photos.value = await listQzonePhotos(topicId);
  } catch (e) {
    await handleQzoneApiError(e, "拉取相片失败");
  } finally {
    photosLoading.value = false;
  }
}

async function openPreview(index: number) {
  const photo = photos.value[index];
  if (!photo) return;
  const epoch = ++previewEpoch;
  previewIndex.value = index;
  previewIsVideo.value = photo.mediaKind === "video";
  previewVideoSrc.value = "";
  previewOpen.value = true;

  if (photo.mediaKind !== "video") {
    previewLoading.value = false;
    return;
  }

  const albumId = photo.albumId || activeAlbumId.value;
  const remote = photo.downloadUrl || photo.previewUrl || "";
  if (!albumId && !remote) {
    $feedback.message.error("无视频地址");
    closePreview();
    return;
  }

  previewLoading.value = true;
  try {
    const localPath = await prepareQzonePreview({
      url: remote,
      albumId,
      assetId: photo.assetId,
      mediaKind: "video"
    });
    if (epoch !== previewEpoch) return;
    previewVideoSrc.value = convertFileSrc(localPath);
  } catch (e) {
    if (epoch !== previewEpoch) return;
    await handleQzoneApiError(e, "视频预览失败");
    closePreview();
  } finally {
    if (epoch === previewEpoch) previewLoading.value = false;
  }
}

function closePreview() {
  previewEpoch++;
  previewOpen.value = false;
  previewVideoSrc.value = "";
  previewLoading.value = false;
}

function previewNav(delta: number) {
  const next = previewIndex.value + delta;
  if (next < 0 || next >= photos.value.length) return;
  void openPreview(next);
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
    await refreshJob();
    if (drawerOpen.value) void refreshQr();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "退出失败");
  }
}

async function onSyncAll() {
  try {
    job.value = await startQzoneSyncJob(null);
    $feedback.message.success("已开始全部下载");
  } catch (e) {
    await handleQzoneApiError(e, "启动失败");
  }
}

async function onSyncAlbum() {
  if (!activeAlbumId.value) {
    $feedback.message.warning("请先选择相册");
    return;
  }
  try {
    job.value = await startQzoneSyncJob(activeAlbumId.value);
    $feedback.message.success(`已开始下载：${activeAlbum.value?.name || "本相册"}`);
  } catch (e) {
    await handleQzoneApiError(e, "启动失败");
  }
}

/**
 * 系统文件框选本地图/视频，上传到当前 QQ 相册（本回合仅图片实际上传）
 */
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
      // 刷新左侧相册计数
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
  try {
    job.value = await pauseQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "暂停失败");
  }
}

async function onResume() {
  try {
    job.value = await resumeQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "继续失败");
  }
}

async function onCancel() {
  try {
    job.value = await cancelQzoneSyncJob();
  } catch (e) {
    $feedback.message.error(e instanceof Error ? e.message : String(e) || "取消失败");
  }
}

/** FAB 拖动与 Drawer / 灯箱壳见 SyncFabShell；此处仅业务监听 */

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
      // 任务结束：刷新当前相册角标（reconcile 后 downloaded 会变）
      if (
        drawerOpen.value &&
        loggedIn.value &&
        activeAlbumId.value &&
        (ev.payload.status === "done" || ev.payload.status === "failed" || ev.payload.status === "idle") &&
        (prev === "cataloging" || prev === "downloading" || prev === "paused")
      ) {
        void selectAlbum(activeAlbumId.value, true);
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
    void refreshAuth().then(() => {
      if (!loggedIn.value) void refreshQr();
      else void loadAlbums();
    });
    void refreshJob();
  } else {
    stopQrPoll();
    closePreview();
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
    :lightbox-open="previewOpen"
    :lightbox-title="previewTitle"
    :lightbox-meta="previewMeta"
    :lightbox-loading="previewLoading"
    lightbox-loading-tip="正在准备视频…"
    :lightbox-can-prev="previewIndex > 0"
    :lightbox-can-next="previewIndex < photos.length - 1"
    @lightbox-close="closePreview"
    @lightbox-prev="previewNav(-1)"
    @lightbox-next="previewNav(1)"
  >
    <template #fab>
      <a-button class="fab-btn" shape="circle" size="large" title="QQ 空间同步">
        <IconifyIcon icon="ri:qq-fill" width="28" height="28" />
      </a-button>
    </template>

    <template #drawer-extra>
      <a-space v-if="loggedIn" :size="4" align="center">
        <div class="drawer-extra-tag">QQ {{ uin || "—" }}</div>
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
      <!-- 对齐 iCloud StatusCard：标题 + 主操作 / 进度统计 / 说明 -->
      <section class="status-card">
        <div class="status-head">
          <div class="status-main">
            <span class="status-title">{{ statusHeadline }}</span>
          </div>
          <div class="action-row">
            <a-button type="primary" :disabled="busy" @click="onSyncAll">全部下载</a-button>
            <a-button v-if="job.status === 'downloading'" danger @click="onPause">暂停</a-button>
            <a-button v-if="job.status === 'paused'" type="primary" @click="onResume">继续</a-button>
            <a-button v-if="busy" danger @click="onCancel">取消任务</a-button>
          </div>
        </div>
        <div v-if="showProgressBar" class="progress-row">
          <a-progress
            class="progress-bar"
            size="small"
            :percent="percent"
            :show-info="false"
            :status="job.status === 'failed' ? 'exception' : job.status === 'done' ? 'success' : 'active'"
          />
          <span v-if="job.total > 0" class="progress-percent">{{ percent }}%</span>
          <span class="progress-stats">{{ progressStatsText }}</span>
        </div>
        <p v-if="statusDescription" class="status-desc">{{ statusDescription }}</p>
      </section>

      <div class="browse-toolbar">
        <span class="browse-hint">左侧选相册，右侧浏览；角标「已下载」表示本机已有；可勾选后从 QQ 空间移除（本机保留）</span>
        <div class="browse-actions">
          <a-button size="small" :loading="refreshingCatalog || albumsLoading" :disabled="busy" @click="onRefreshCatalog"> 刷新目录 </a-button>
          <a-button v-if="!selectMode" size="small" :disabled="!activeAlbumId || !photos.length || busy" @click="selectMode = true"> 勾选 </a-button>
          <template v-else>
            <a-button size="small" danger :loading="deletingCloud" :disabled="selectedCount === 0 || busy" @click="onDeleteSelectedFromCloud">
              从 QQ 空间移除{{ selectedCount ? ` (${selectedCount})` : "" }}
            </a-button>
            <a-button size="small" :disabled="deletingCloud" @click="exitSelectMode">取消勾选</a-button>
          </template>
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
              <span v-if="photos.length" class="sub">
                已加载 {{ photos.length }} 张
                <template v-if="activeAlbum && activeAlbum.total > 0 && photos.length !== activeAlbum.total"> · 云端申报 {{ activeAlbum.total }} </template>
              </span>
            </div>
            <div class="photo-head-actions">
              <a-button size="small" type="primary" :disabled="busy || !activeAlbumId || uploadingAlbum" @click="onSyncAlbum"> 下载本相册 </a-button>
              <a-button size="small" :loading="uploadingAlbum" :disabled="busy || !activeAlbumId || uploadingAlbum" @click="onUploadToAlbum">
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
                      :data-marquee-key="row.photo.assetId"
                      :class="{ selected: selectMode && isSelected(row.photo.assetId) }"
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
                      <!-- 角标：synced 且盘上文件仍在（拉列表前会 reconcile 缺盘） -->
                      <span v-if="row.photo.downloaded" class="cell-badge">已下载</span>
                      <span v-if="selectMode && isSelected(row.photo.assetId)" class="cell-check" aria-hidden="true">✓</span>
                    </button>
                  </div>
                </section>
                <div v-if="qzoneMarqueeStyle" class="sync-marquee" :style="qzoneMarqueeStyle" />
              </div>
              <a-empty v-else-if="!photosLoading && activeAlbumId" description="此相册暂无内容" :image="false" />
            </a-spin>
          </div>
        </section>
      </div>
    </div>

    <template #lightbox>
      <video v-if="previewIsVideo && previewVideoSrc" class="viewer-media" controls autoplay playsinline :src="previewVideoSrc" />
      <BaseImage
        v-else-if="!previewIsVideo && previewImageSrc"
        class="viewer-media viewer-img"
        :src="previewImageSrc"
        fit="contain"
        width="100%"
        max-height="100%"
        :lazy="false"
      />
      <div v-else-if="!previewLoading" class="preview-empty">
        {{ previewIsVideo ? "视频准备中或无法播放" : "暂无预览" }}
      </div>
    </template>
  </SyncFabShell>
</template>

<style scoped lang="scss">
.fab-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  cursor: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
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
  background: #fff;
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
    color: #52c41e;
  }
  &.error,
  &.expired {
    color: #ff4d4f;
  }
}

.browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}
.status-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}
.status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.status-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-top: 4px;
}
.status-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.status-desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 22px;
}
.progress-bar {
  flex: 1;
  min-width: 80px;
  margin: 0;
}
.progress-percent {
  flex-shrink: 0;
  width: 32px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  text-align: right;
}
.progress-stats {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}
.browse-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.browse-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
  min-width: 0;
  flex: 1;
}
.browse-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-shrink: 0;
  justify-content: flex-end;
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
    background: rgba(255, 255, 255, 0.08);
  }
  &.active {
    background: rgba(22, 119, 255, 0.18);
  }
}
.cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-color-secondary, rgba(255, 255, 255, 0.08));
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
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
  border: 2px solid transparent;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--bg-color-secondary, rgba(255, 255, 255, 0.08));
  &.selected {
    border-color: var(--color-primary);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
.cell-ph {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  background-size: 200% 100%;
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
  line-height: 1.6;
  pointer-events: none;
}
.cell-check {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
}
.badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}
.preview-empty {
  color: var(--color-text-tertiary);
  padding: 48px;
}
</style>
